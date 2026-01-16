import type { AppConfig, ProtocolVersion } from "@maho/shared";
import { createInitialState, evaluateEvent } from "./state";
import { createWsHub } from "./wsHub";
import { handleHttp } from "./routes";
import {
  loadOrCreateStateFile,
  saveStateFile,
  resolveAppDataPath,
} from "./store";
import { loadEmotes } from "./emotes";
import { loadBadges } from "./badges";
import { appendEvent } from "./commands";
import { connectTwitchIrc } from "@maho/twitch";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";
const SUPPORTED_PROTOCOL: ProtocolVersion = 1;

const DATA_DIR = resolveAppDataPath();
console.log(`[storage] using data directory: ${DATA_DIR}`);

const { filePath, state: persisted } = await loadOrCreateStateFile({
  dataDir: DATA_DIR,
});

const state = createInitialState({
  config: persisted.config,
  ruleset: persisted.rules,
});

let emoteLoadToken = 0;

state.emoteMap = await loadEmotes(state.config);

const initialBadges = await loadBadges(state.config.channel);
state.badgeMaps.global = initialBadges.globalSet;
state.badgeMaps.channel = initialBadges.channelSet;

async function persistNow() {
  await saveStateFile(filePath, {
    version: 1,
    config: state.config,
    rules: state.ruleset,
  });
}

const hub = createWsHub(state, SUPPORTED_PROTOCOL, persistNow, {
  async onConfigChanged(next, prev) {
    const needsReconnect =
      next.channel !== prev.channel ||
      next.twitchUsername !== prev.twitchUsername ||
      next.twitchToken !== prev.twitchToken;

    if (needsReconnect) {
      startTwitch(next);
      if (next.channel !== prev.channel) {
        const b = await loadBadges(next.channel);
        state.badgeMaps.channel = b.channelSet;
      }
    }

    if (next.seventvUserId !== prev.seventvUserId) {
      console.log("Config changed, reloading emotes...");
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

let twitchConn: { close: () => void } | null = null;

function startTwitch(cfg: AppConfig) {
  twitchConn?.close();
  twitchConn = connectTwitchIrc({
    channel: cfg.channel,
    username: cfg.twitchUsername || undefined,
    token: cfg.twitchToken || undefined,
    onStatus: (s) => console.log(s),
    onChatMessage: (ev) => {
      const payload = evaluateEvent(state, ev);
      const entry = appendEvent(state, payload);
      hub.broadcast({
        op: "event",
        revision: entry.revision,
        payload: entry.payload,
      });
    },
  });
}

startTwitch(state.config);

Bun.serve({
  port: PORT,
  hostname: HOST,

  fetch(req, server) {
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

    const res = handleHttp(req, state, hub, PORT);
    if (res) return res;

    return new Response("not found", { status: 404 });
  },

  websocket: {
    open: hub.onOpen,
    close: hub.onClose,
    message: hub.onMessage,
  },
});

console.log(`server:  http://${HOST}:${PORT}`);
console.log(`health:  http://${HOST}:${PORT}/health`);
console.log(`overlay: http://${HOST}:${PORT}/overlay`);
console.log(`control: http://${HOST}:${PORT}/control`);
console.log(`state file: ${filePath}`);
