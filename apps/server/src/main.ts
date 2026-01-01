import type { ProtocolVersion } from "@maho/shared";
import { createInitialState } from "./state";
import { createWsHub } from "./wsHub";
import { handleHttp } from "./routes";
import { loadOrCreateStateFile, saveStateFile } from "./store";

const PORT = Number(process.env.PORT ?? 3000);
const SUPPORTED_PROTOCOL: ProtocolVersion = 1;

const { filePath, state: persisted } = await loadOrCreateStateFile();

const state = createInitialState({
  config: persisted.config,
  ruleset: persisted.rules,
});

async function persistNow() {
  await saveStateFile(filePath, {
    version: 1,
    config: state.config,
    rules: state.ruleset,
  });
}

const hub = createWsHub(state, SUPPORTED_PROTOCOL, persistNow);

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
