import type { AppConfig, ProtocolVersion } from "@maho/shared";
import { createInitialState, evaluateEvent, applyThemePackage } from "./state";
import { createWsHub } from "./wsHub";
import { handleHttp } from "./routes";
import {
  loadOrCreateStateFile,
  createPersistor,
  resolveAppDataPath,
} from "./store";
import { loadEmotes } from "./emotes";
import { loadBadges } from "./badges";
import { appendEvent } from "./commands";
import { createThemeLoader } from "./themes";
import {
  connectTwitchIrc,
  connectEventSub,
  validateToken,
  getTwitchUserByName,
  type TwitchTokenInfo,
} from "@maho/twitch";
import { join } from "node:path";

const PORT = 3000;
const HOST = "127.0.0.1";
const SUPPORTED_PROTOCOL: ProtocolVersion = 1;

const DATA_DIR = resolveAppDataPath();
console.log(`[storage] using data directory: ${DATA_DIR}`);

const { filePath, state: persisted } = await loadOrCreateStateFile({
  dataDir: DATA_DIR,
});

const persistor = createPersistor(filePath);

const state = createInitialState({
  config: persisted.config,
  ruleset: persisted.rules,
  theme: persisted.theme,
});

const themes = createThemeLoader(
  join(process.cwd(), "themes"),
  join(DATA_DIR, "themes")
);

try {
  const targetThemeId = state.theme.activeThemeId || "default";
  const pkg = await themes.load(targetThemeId, state.config.themeDirectory);
  applyThemePackage(state, pkg, pkg.id);
  console.log(`[themes] loaded ${pkg.id}`);
} catch (e) {
  console.warn(
    `[themes] could not load theme, trying internal default`
  );
  try {
    const fallback = await themes.load("default");
    applyThemePackage(state, fallback, "default");
  } catch (err) {
    console.error(`[themes] could not load internal default`);
  }
}

const channelUser = await getTwitchUserByName(state.config.channel);
state.emoteMap = await loadEmotes(channelUser?.id);

const initialBadges = await loadBadges(state.config.channel);
state.badgeMaps.global = initialBadges.globalSet;
state.badgeMaps.channel = initialBadges.channelSet;

function scheduleSave() {
  persistor.schedule({
    version: 1,
    config: state.config,
    rules: state.ruleset,
    theme: state.theme,
  });
}

// twitch services
let twitchIrc: { close: () => void } | null = null;
let twitchEventSub: { close: () => void } | null = null;

let isStartingServices = false;

async function startTwitchServices(cfg: AppConfig) {
  if (isStartingServices) return;
  isStartingServices = true;

  try {
    // shutdown existing
    twitchIrc?.close();
    twitchIrc = null;
    twitchEventSub?.close();
    twitchEventSub = null;

    // validate identity
    let identity: TwitchTokenInfo | null = null;
    if (cfg.twitchToken) {
      try {
        identity = await validateToken(cfg.twitchToken);
        console.log(
          `[twitch] authenticated as ${identity.login} (client: ${identity.clientId})`
        );
      } catch (e: any) {
        console.error(`[twitch] token validation failed: ${e.message}`);
      }
    }

    // irc
    twitchIrc = connectTwitchIrc({
      channel: cfg.channel,
      username: identity?.login || cfg.twitchUsername || undefined,
      token: cfg.twitchToken || undefined,
      onStatus: (s) => console.log(s),
      onChatMessage: (ev) => {
        const payload = evaluateEvent(state, ev);
        const entry = appendEvent(state, payload);
        hub.broadcast({
          op: "event",
          seq: entry.seq,
          payload: entry.payload,
        });
      },
      onMessageDeleted: (msgId) => {
        const entry = state.eventLog.find((e) => e.payload.event.id === msgId);
        if (entry) {
          (entry.payload.event as any).isDeleted = true;
          const updated = evaluateEvent(state, entry.payload.event);
          entry.payload.presentation = updated.presentation;

          hub.broadcast({
            op: "event:update",
            id: msgId,
            patch: { isDeleted: true, presentation: updated.presentation },
          });
        }
      },
      onUserTimedOut: ({ login, duration }) => {
        console.log(`[mod] ${login} was ${duration ? "timed out" : "banned"}`);
      },
    });

    // eventsub alerts
    if (identity && cfg.twitchToken) {
      twitchEventSub = connectEventSub({
        token: cfg.twitchToken,
        identity,
        onStatus: (s) => console.log(s),
        onError: (e) => console.error(`[eventsub] error:`, e),
        onEvent: (ev) => {
          const payload = evaluateEvent(state, ev);
          const entry = appendEvent(state, payload);
          hub.broadcast({
            op: "event",
            seq: entry.seq,
            payload: entry.payload,
          });
        },
      });
    } else {
      console.log("[eventsub] skipping: no valid token available");
    }
  } finally {
    isStartingServices = false;
  }
}

startTwitchServices(state.config);

// ws hub and config hooks
const hub = createWsHub(state, themes, SUPPORTED_PROTOCOL, scheduleSave, {
  async onConfigChanged(next, prev) {
    if (next.channel !== prev.channel) {
      const user = await getTwitchUserByName(next.channel);
      state.emoteMap = await loadEmotes(user?.id);

      const b = await loadBadges(next.channel);
      state.badgeMaps.channel = b.channelSet;

      await startTwitchServices(next);
    } else if (next.twitchToken !== prev.twitchToken) {
      await startTwitchServices(next);
    }
  },
});

// server setup
Bun.serve({
  port: PORT,
  hostname: HOST,

  async fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      const origin = req.headers.get("origin");
      if (origin) {
        console.log(`[server] ws connection attempt from origin: ${origin}`);
      }

      if (server.upgrade(req, { data: {} })) return;
      return new Response("upgrade failed", { status: 400 });
    }

    const res = await handleHttp(req, state, hub, PORT);
    if (res) return res;

    return new Response("not found", { status: 404 });
  },

  websocket: {
    open: hub.onOpen,
    close: hub.onClose,
    message: hub.onMessage,
  },
});

const shutdown = async () => {
  console.log("[server] shutting down...");
  twitchIrc?.close();
  twitchEventSub?.close();
  await persistor.flush(); // force write any pending changes
  console.log("[server] state flushed, bye");
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`server:  http://${HOST}:${PORT}`);
console.log(`health:  http://${HOST}:${PORT}/health`);
console.log(`overlay: http://${HOST}:${PORT}/overlay`);
console.log(`state file: ${filePath}`);
