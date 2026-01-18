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
  sanitizeConfig,
  sanitizePatch,
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
  schedulePersist: () => void,
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
          data: sanitizeConfig(state.config),
        },
        rules: { rev: state.rulesRevision, data: state.ruleset },
        theme: { rev: state.themeRevision, data: state.theme },
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

      state.config = parsed.data;
      state.configRevision++;

      broadcast({
        op: "config:changed",
        rev: state.configRevision,
        patch: sanitizePatch(msg.patch),
      });

      hooks?.onConfigChanged?.(state.config, prev);
      schedulePersist();

      return;
    }

    if (msg.op === "theme:patch") {
      if (!requireControl(ws)) return;

      const nextValues = { ...state.theme.values, ...(msg.patch.values || {}) };
      state.theme.values = nextValues;

      if (msg.patch.activeThemeId) {
        state.theme.activeThemeId = msg.patch.activeThemeId;
      }

      state.themeRevision++;

      broadcast({
        op: "theme:changed",
        rev: state.themeRevision,
        patch: msg.patch,
      });

      schedulePersist();
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
      state.rulesRevision++;

      broadcast({
        op: "rules:changed",
        rev: state.rulesRevision,
        rules: state.ruleset,
      });

      schedulePersist();

      return;
    }

    send(ws, { op: "error", message: "unknown op" });
  }

  return { clients, roles, broadcast, send, onMessage, onOpen, onClose };
}
