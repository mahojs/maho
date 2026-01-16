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

      if (msg.role === "control") {
        if (state.config.apiKey && msg.apiKey !== state.config.apiKey) {
          console.warn(`rejected connection; invalid api key`);
          send(ws, { op: "error", message: "invalid api key" });
          ws.close(4003, "forbidden");
          return;
        }
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
        config: {
          rev: state.configRevision,
          data: state.config,
        },
        rules: {
          rev: state.rulesRevision,
          data: state.ruleset,
        },
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

    if (msg.op === "config:patch") {
      if (!requireControl(ws)) {
        send(ws, {
          op: "error",
          message: "only control clients can patch config",
        });
        return;
      }

      // merge incoming patch with current state
      const nextCandidate = { ...state.config, ...msg.patch };

      // validate result of merge
      const parsed = validateConfig(nextCandidate);
      if (!parsed.success) {
        send(ws, {
          op: "error",
          message: "invalid config result",
          details: { issues: parsed.error.issues },
        });
        return;
      }

      // store previous state for rollback on error
      const prev = state.config;
      const next = parsed.data;

      // optimistic update; update memory immediately
      state.config = next;

      // asynchronously persist to disk, optimistic implementation
      (async () => {
        try {
          await persist();

          //increment revision and notify on success
          state.configRevision++;

          broadcast({
            op: "config:changed",
            rev: state.configRevision,
            patch: msg.patch, // Only broadcast what changed
          });

          hooks?.onConfigChanged?.(state.config, prev);
        } catch (e) {
          // revert memory state on failure
          state.config = prev;
          const errMessage = String(e);

          send(ws, {
            op: "error",
            message: "failed to persist config; change reverted",
            details: errMessage,
          });

          broadcastToControl(
            {
              op: "control:notice",
              rev: state.configRevision,
              level: "error",
              message: "Config save failed",
              details: errMessage,
            },
            ws
          );
        }
      })();

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

      const prev = state.ruleset;
      const next = parsed.data;

      setRuleset(state, next);

      (async () => {
        try {
          await persist();

          state.rulesRevision++;

          broadcast({
            op: "rules:changed",
            rev: state.rulesRevision,
            rules: state.ruleset,
          });
        } catch (e) {
          setRuleset(state, prev);
          const errMessage = String(e);

          send(ws, {
            op: "error",
            message: "failed to persist rules; change reverted",
            details: errMessage,
          });

          broadcastToControl(
            {
              op: "control:notice",
              rev: state.rulesRevision,
              level: "error",
              message: "failed to persist rules; change reverted",
              details: errMessage,
            },
            ws
          );
        }
      })();

      return;
    }

    send(ws, { op: "error", message: "unknown op" });
  }

  return { clients, roles, broadcast, send, onMessage, onOpen, onClose };
}
