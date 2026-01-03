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
  persist: () => Promise<void>,
  hooks?: {
    onConfigChanged?: (next: State["config"], prev: State["config"]) => void;
  }
): WsHub {
  const clients = new Set<WS>();
  const roles = new WeakMap<WS, ClientRole>();

  let configCommitToken = 0;
  let rulesCommitToken = 0;

  function requireHello(ws: WS): boolean {
    return typeof roles.get(ws) !== "undefined";
  }

  function requireControl(ws: WS): boolean {
    return roles.get(ws) === "control";
  }

  function encode(msg: ServerToClient): string {
    return JSON.stringify(msg);
  }

  function send(ws: WS, msg: ServerToClient) {
    ws.send(encode(msg));
  }

  function broadcast(msg: ServerToClient) {
    const s = encode(msg);
    for (const ws of clients) {
      if (!requireHello(ws)) continue;
      ws.send(s);
    }
  }

  function broadcastToControl(msg: ServerToClient, except?: WS) {
    const s = encode(msg);
    for (const ws of clients) {
      if (ws === except) continue;
      if (!requireHello(ws)) continue;
      if (roles.get(ws) === "control") ws.send(s);
    }
  }

  function commitAndPublish(opts: {
    isStale: () => boolean;
    onPersistFail: (e: unknown) => void;
    onCommitted: () => void;
  }) {
    (async () => {
      try {
        await persist();
      } catch (e) {
        opts.onPersistFail(e);
        return;
      }
      if (opts.isStale()) return;
      opts.onCommitted();
    })();
  }

  function onOpen(ws: WS) {
    clients.add(ws);
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
      ws.close(1002, "invalid JSON");
      return;
    }

    if (msg.op === "hello") {
      if (requireHello(ws)) {
        send(ws, { op: "error", message: "hello already received" });
        ws.close(1002, "duplicate hello");
        return;
      }

      if (msg.protocolVersion !== supportedProtocol) {
        send(ws, {
          op: "error",
          message: `unsupported protocolVersion ${msg.protocolVersion}; server supports ${supportedProtocol}`,
        });
        ws.close(1002, "unsupported protocol");
        return;
      }

      roles.set(ws, msg.role);
      send(ws, {
        op: "state",
        revision: state.revision,
        config: state.config,
        rules: state.ruleset,
      });
      if (msg.role === "overlay") {
        send(ws, { op: "replay", events: state.eventLog });
      }
      return;
    }

    if (!requireHello(ws)) {
      send(ws, { op: "error", message: "hello required" });
      ws.close(1002, "hello required");
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

      const token = ++configCommitToken;
      const prev = state.config;
      const next = parsed.data;

      state.config = next;

      commitAndPublish({
        isStale: () => token !== configCommitToken,

        onPersistFail: (e) => {
          state.config = prev;
          const err = String(e);

          send(ws, {
            op: "error",
            message: "failed to persist config; change was not applied",
            details: err,
          });

          const notice = {
            op: "control:notice",
            revision: state.revision,
            level: "error",
            message: "failed to persist config; change was not applied",
            details: err,
          } as const;

          broadcastToControl(notice, ws);
        },

        onCommitted: () => {
          state.revision++;

          broadcast({
            op: "config:changed",
            revision: state.revision,
            config: state.config,
          });

          hooks?.onConfigChanged?.(state.config, prev);
        },
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

      const token = ++rulesCommitToken;
      const prev = state.ruleset;
      const next = parsed.data;

      setRuleset(state, next);

      commitAndPublish({
        isStale: () => token !== rulesCommitToken,

        onPersistFail: (e) => {
          setRuleset(state, prev);
          const err = String(e);

          send(ws, {
            op: "error",
            message: "failed to persist rules; change was not applied",
            details: err,
          });

          const notice = {
            op: "control:notice",
            revision: state.revision,
            level: "error",
            message: "failed to persist rules; change was not applied",
            details: err,
          } as const;

          broadcastToControl(notice, ws);
        },

        onCommitted: () => {
          state.revision++;

          broadcast({
            op: "rules:changed",
            revision: state.revision,
            rules: state.ruleset,
          });
        },
      });

      return;
    }

    send(ws, { op: "error", message: "unknown op" });
  }

  return { clients, roles, broadcast, send, onMessage, onOpen, onClose };
}
