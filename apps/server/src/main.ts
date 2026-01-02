import type { ProtocolVersion } from "@maho/shared";
import { createInitialState, evaluateEvent } from "./state";
import { createWsHub } from "./wsHub";
import { handleHttp } from "./routes";
import { loadOrCreateStateFile, saveStateFile } from "./store";
import { loadEmotes } from "./emotes";
import { connectTwitchIrc } from "@maho/twitch";

const PORT = Number(process.env.PORT ?? 3000);
const SUPPORTED_PROTOCOL: ProtocolVersion = 1;

const { filePath, state: persisted } = await loadOrCreateStateFile();

const state = createInitialState({
  config: persisted.config,
  ruleset: persisted.rules,
});

state.emoteMap = await loadEmotes(state.config);

async function persistNow() {
  await saveStateFile(filePath, {
    version: 1,
    config: state.config,
    rules: state.ruleset,
  });
}

const hub = createWsHub(state, SUPPORTED_PROTOCOL, persistNow, {
  onConfigChanged(next, prev) {
    if (next.channel !== prev.channel) startTwitch(next.channel);
    
    if (next.seventvUserId !== prev.seventvUserId) {
        console.log("Config changed, reloading emotes...");
        loadEmotes(next).then(map => {
            state.emoteMap = map;
        });
    }
  },
});

let twitchConn: { close: () => void } | null = null;

function startTwitch(channel: string) {
  twitchConn?.close();
  twitchConn = connectTwitchIrc({
    channel,
    onStatus: (s) => console.log(s),
    onChatMessage: (ev) => {
      const payload = evaluateEvent(state, ev);
      hub.broadcast({ op: "event", payload });
    },
  });
}

startTwitch(state.config.channel);

Bun.serve({
  port: PORT,

  fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
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

console.log(`server:  http://localhost:${PORT}`);
console.log(`health:  http://localhost:${PORT}/health`);
console.log(`overlay: http://localhost:${PORT}/overlay`);
console.log(`control: http://localhost:${PORT}/control`);
console.log(`state file: ${filePath}`);
