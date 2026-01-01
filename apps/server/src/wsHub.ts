import type {
  ClientRole,
  ClientToServer,
  ProtocolVersion,
  ServerToClient,
} from "@maho/shared";
import {
  validateConfig,
  validateRuleset,
  setRuleset,
  type State,
} from "./state";
import type { ServerWebSocket } from "bun";

type WsData = {};
type WS = ServerWebSocket<WsData>;

export type WsHub = {
  clients: Set<WS>;
  roles: WeakMap<WS, ClientRole>;
  broadcast: (msg: ServerToClient) => void;
  send: (ws: WS, msg: ServerToClient) => void;
  onMessage: (ws: WS, raw: unknown) => void;
  onOpen: (ws: WS) => void;
  onClose: (ws: WS) => void;
};

export function createWsHub(
  state: State,
  supportedProtocol: ProtocolVersion,
  persist: () => Promise<void>
): WsHub {
  const clients = new Set<WS>();
  const roles = new WeakMap<WS, ClientRole>();

  function send(ws: WS, msg: ServerToClient) {
    ws.send(JSON.stringify(msg));
  }

  function broadcast(msg: ServerToClient) {
    const s = JSON.stringify(msg);
    for (const ws of clients) ws.send(s);
  }

  function requireHello(ws: WS): boolean {
    return typeof roles.get(ws) !== "undefined";
  }

  function requireControl(ws: WS): boolean {
    return roles.get(ws) === "control";
  }

  function onOpen(ws: WS) {
    clients.add(ws);
    send(ws, { op: "state", config: state.config, rules: state.ruleset });
  }

  function onClose(ws: WS) {
    clients.delete(ws);
    roles.delete(ws);
  }

  function onMessage(ws: WS, raw: unknown) {
    let msg: ClientToServer;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      send(ws, { op: "error", message: "invalid JSON" });
      return;
    }

    if (msg.op === "hello") {
      if (msg.protocolVersion !== supportedProtocol) {
        send(ws, {
          op: "error",
          message: `unsupported protocolVersion ${msg.protocolVersion}; server supports ${supportedProtocol}`,
        });
        return;
      }
      roles.set(ws, msg.role);
      return;
    }

    if (!requireHello(ws)) {
      send(ws, { op: "error", message: "hello required" });
      return;
    }

    if (msg.op === "config:set") {
      if (!requireControl(ws)) {
        send(ws, {
          op: "error",
          message: "only control clients can set config",
        });
        return;
      }

      const parsed = validateConfig(msg.config);
      if (!parsed.success) {
        send(ws, {
          op: "error",
          message: "invalid config",
          details: { issues: parsed.error.issues },
        });
        return;
      }

      state.config = parsed.data;
      broadcast({ op: "config:changed", config: state.config });

      persist().catch((e) => {
        send(ws, {
          op: "error",
          message: "failed to persist config",
          details: String(e),
        });
      });

      return;
    }

    if (msg.op === "rules:set") {
      if (!requireControl(ws)) {
        send(ws, {
          op: "error",
          message: "only control clients can set rules",
        });
        return;
      }

      const parsed = validateRuleset(msg.rules);
      if (!parsed.success) {
        send(ws, {
          op: "error",
          message: "invalid ruleset",
          details: { issues: parsed.error.issues },
        });
        return;
      }

      setRuleset(state, parsed.data);
      broadcast({ op: "rules:changed", rules: state.ruleset });

      persist().catch((e) => {
        send(ws, {
          op: "error",
          message: "failed to persist rules",
          details: String(e),
        });
      });

      return;
    }

    send(ws, { op: "error", message: "unknown op" });
  }

  return { clients, roles, broadcast, send, onMessage, onOpen, onClose };
}
