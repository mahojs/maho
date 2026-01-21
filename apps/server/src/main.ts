import type { AppConfig, ProtocolVersion } from "@maho/shared";
import { createInitialState, evaluateEvent } from "./state";
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
import {
  connectTwitchIrc,
  validateToken,
  connectEventSub,
  type TwitchTokenInfo,
} from "@maho/twitch";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";
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

let emoteLoadToken = 0;

state.emoteMap = await loadEmotes(state.config);

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
const hub = createWsHub(state, SUPPORTED_PROTOCOL, scheduleSave, {
  async onConfigChanged(next, prev) {
    const needsReconnect =
      next.channel !== prev.channel ||
      next.twitchUsername !== prev.twitchUsername ||
      next.twitchToken !== prev.twitchToken;

    if (needsReconnect) {
      startTwitchServices(next);
      if (next.channel !== prev.channel) {
        const b = await loadBadges(next.channel);
        state.badgeMaps.channel = b.channelSet;
      }
    }

    if (next.seventvUserId !== prev.seventvUserId) {
      console.log("[emotes] config changed, reloading emotes...");
      const token = ++emoteLoadToken;

      loadEmotes(next)
        .then((map) => {
          if (token !== emoteLoadToken) return;
          state.emoteMap = map;
        })
        .catch((e) => {
          if (token !== emoteLoadToken) return;
          console.error("[emotes] reload failed:", e);
        });
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
        try {
          const originUrl = new URL(origin);
          if (
            originUrl.hostname !== "localhost" &&
            originUrl.hostname !== "127.0.0.1"
          ) {
            return new Response("Forbidden", { status: 403 });
          }
        } catch {
          if (origin !== "null") {
            return new Response("Forbidden", { status: 403 });
          }
        }
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
console.log(`control: http://${HOST}:${PORT}/control`);
console.log(`state file: ${filePath}`);
