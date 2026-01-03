import {
  type AppConfig,
  type Ruleset,
  type ClientToServer,
  type ServerToClient,
  type ProtocolVersion,
  type ClientRole,
} from "@maho/shared";
import { reactive, readonly } from "vue";

type WsStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

export type ControlLogEntry =
  | {
      kind: "notice";
      ts: number;
      revision?: number;
      level: "info" | "warn" | "error";
      message: string;
      details?: unknown;
    }
  | {
      kind: "error";
      ts: number;
      revision?: number;
      message: string;
      details?: unknown;
    }
  | {
      kind: "info";
      ts: number;
      message: string;
    };

type ControlWsState = {
  status: WsStatus;
  lastError?: string;

  // last server snapshot/state
  revision: number;
  serverConfig: AppConfig | null;
  serverRules: Ruleset | null;

  // operator log, request errors
  log: ControlLogEntry[];

  // internal
  ws: WebSocket | null;
};

const MAX_LOG = 200;

function now() {
  return Date.now();
}

function pushLog(state: ControlWsState, entry: ControlLogEntry) {
  state.log.unshift(entry);
  if (state.log.length > MAX_LOG) state.log.length = MAX_LOG;
}

function wsUrlFromLocation(): string {
  // `/ws` works as same-origin
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

export function createControlWs(opts?: {
  protocolVersion?: ProtocolVersion;
  role?: ClientRole;
}) {
  const protocolVersion: ProtocolVersion = opts?.protocolVersion ?? 1;
  const role: ClientRole = opts?.role ?? "control";

  const state = reactive<ControlWsState>({
    status: "idle",
    lastError: undefined,

    revision: -1,
    serverConfig: null,
    serverRules: null,

    log: [],
    ws: null,
  });

  function handleMessage(msg: ServerToClient) {
    // revision gating; ignore out-of-order messages
    const rev = (msg as any).revision;
    if (typeof rev === "number") {
      if (rev < state.revision) return;
      state.revision = rev;
    }

    switch (msg.op) {
      case "state": {
        state.serverConfig = msg.config;
        state.serverRules = msg.rules;
        state.lastError = undefined;
        pushLog(state, {
          kind: "info",
          ts: now(),
          message: `state received (rev ${state.revision})`,
        });
        return;
      }

      case "config:changed": {
        state.serverConfig = msg.config;
        state.lastError = undefined;
        pushLog(state, {
          kind: "info",
          ts: now(),
          message: `config updated (rev ${state.revision})`,
        });
        return;
      }

      case "rules:changed": {
        state.serverRules = msg.rules;
        state.lastError = undefined;
        pushLog(state, {
          kind: "info",
          ts: now(),
          message: `rules updated (rev ${state.revision})`,
        });
        return;
      }

      case "control:notice": {
        pushLog(state, {
          kind: "notice",
          ts: now(),
          revision: msg.revision,
          level: msg.level,
          message: msg.message,
          details: msg.details,
        });
        return;
      }

      case "error": {
        state.lastError = msg.message;
        pushLog(state, {
          kind: "error",
          ts: now(),
          revision:
            typeof (msg as any).revision === "number"
              ? (msg as any).revision
              : undefined,
          message: msg.message,
          details: msg.details,
        });
        return;
      }

      case "event":
      case "replay":
        // ignore overlay runtime stream for now
        return;

      default: {
        pushLog(state, {
          kind: "info",
          ts: now(),
          message: `ignored op ${(msg as any).op}`,
        });
        return;
      }
    }
  }

  function connect() {
    if (
      state.ws &&
      (state.status === "connecting" || state.status === "connected")
    ) {
      return;
    }

    state.status = "connecting";
    state.lastError = undefined;

    const ws = new WebSocket(wsUrlFromLocation());
    state.ws = ws;

    ws.addEventListener("open", () => {
      const hello: ClientToServer = {
        op: "hello",
        role,
        protocolVersion,
      };
      ws.send(JSON.stringify(hello));
      state.status = "connected";
      pushLog(state, { kind: "info", ts: now(), message: "ws connected" });
    });

    ws.addEventListener("message", (e) => {
      let parsed: ServerToClient;
      try {
        parsed = JSON.parse(String(e.data)) as ServerToClient;
      } catch {
        pushLog(state, {
          kind: "error",
          ts: now(),
          message: "bad JSON from server",
        });
        return;
      }
      handleMessage(parsed);
    });

    ws.addEventListener("close", () => {
      state.status = "disconnected";
      state.ws = null;
      pushLog(state, { kind: "info", ts: now(), message: "ws disconnected" });
    });

    ws.addEventListener("error", () => {
      state.status = "error";
      state.lastError = "websocket error";
      pushLog(state, { kind: "error", ts: now(), message: "ws error" });
      try {
        ws.close();
      } catch {
        // ignore
      }
    });
  }

  function disconnect() {
    const ws = state.ws;
    state.ws = null;
    if (!ws) return;
    try {
      ws.close(1000, "client disconnect");
    } catch {
      // ignore
    }
  }

  function sendMsg(msg: ClientToServer) {
    if (!state.ws || state.status !== "connected") {
      pushLog(state, {
        kind: "error",
        ts: now(),
        message: "cannot send: websocket not connected",
      });
      return;
    }
    state.ws.send(JSON.stringify(msg));
  }

  function setConfig(config: AppConfig) {
    sendMsg({ op: "config:set", config });
  }

  function setRules(rules: Ruleset) {
    sendMsg({ op: "rules:set", rules });
  }

  return {
    state: readonly(state),
    connect,
    disconnect,
    setConfig,
    setRules,
  };
}
