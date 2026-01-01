import type { ProtocolVersion } from "@maho/shared";
import { createIntiialState } from "./state";
import { createWsHub } from "./wsHub";
import { handleHttp } from "./routes";

const PORT = Number(process.env.PORT ?? 3000);
const SUPPORTED_PROTOCOL: ProtocolVersion = 1;

const state = createIntiialState();
const hub = createWsHub(state, SUPPORTED_PROTOCOL);

Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws" && server.upgrade(req, { data: {} })) return;
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

console.log(`server: http://localhost:${PORT}`);
console.log(`health: http://localhost:${PORT}/health`);
console.log(`overlay: http://localhost:${PORT}/overlay`);
console.log(`control: http://localhost:${PORT}/control`);
console.log(`dev: http://localhost:${PORT}/dev/state`);