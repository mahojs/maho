import type {
  AppConfig,
  Ruleset,
  ClientToServer,
  ServerToClient,
  ProtocolVersion,
  ClientRole,
} from "@maho/shared";
import { useServerStore, type ControlLogEntry } from "../stores/server";

function now() {
  return Date.now();
}

function wsUrlFromLocation(): string {
  // `/ws` works as same-origin
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

let ws: WebSocket | null = null;

export function useControlConnection(opts?: {
  protocolVersion?: ProtocolVersion;
  role?: ClientRole;
}) {
  const store = useServerStore();
  const protocolVersion: ProtocolVersion = opts?.protocolVersion ?? 1;
  const role: ClientRole = opts?.role ?? "control";

  function log(entry: ControlLogEntry) {
    store.pushLog(entry);
  }

  function handleMessage(msg: ServerToClient) {
    switch (msg.op) {
      case "state": {
        store.updateState(msg.revision, msg.config, msg.rules);
        log({
          kind: "info",
          ts: now(),
          message: `state received (rev ${msg.revision})`,
        });
        return;
      }

      case "config:changed": {
        store.updateConfig(msg.revision, msg.config);
        log({
          kind: "info",
          ts: now(),
          message: `config updated (rev ${msg.revision})`,
        });
        return;
      }

      case "rules:changed": {
        store.updateRules(msg.revision, msg.rules);
        log({
          kind: "info",
          ts: now(),
          message: `rules updated (rev ${msg.revision})`,
        });
        return;
      }

      case "control:notice": {
        log({
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
        store.lastError = msg.message;
        log({
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
        return;

      default: {
        log({
          kind: "info",
          ts: now(),
          message: `ignored op ${(msg as any).op}`,
        });
        return;
      }
    }
  }

  function connect() {
    if (ws && (store.isConnecting || store.isConnected)) return;

    store.setStatus("connecting");
    store.clearError();

    ws = new WebSocket(wsUrlFromLocation());

    ws.addEventListener("open", () => {
      const hello: ClientToServer = {
        op: "hello",
        role,
        protocolVersion,
        apiKey: window.MAHO_API_KEY,
      };
      ws?.send(JSON.stringify(hello));
      store.setStatus("connected");
      log({ kind: "info", ts: now(), message: "ws connected" });
    });

    ws.addEventListener("message", (e) => {
      let parsed: ServerToClient;
      try {
        parsed = JSON.parse(String(e.data)) as ServerToClient;
      } catch {
        log({
          kind: "error",
          ts: now(),
          message: "bad JSON from server",
        });
        return;
      }
      handleMessage(parsed);
    });

    ws.addEventListener("close", () => {
      store.setStatus("disconnected");
      ws = null;
      log({ kind: "info", ts: now(), message: "ws disconnected" });
    });

    ws.addEventListener("error", () => {
      store.setError("websocket error");
      log({ kind: "error", ts: now(), message: "ws error" });
      try {
        ws?.close();
      } catch {
        // ignore
      }
    });
  }

  function disconnect() {
    if (!ws) return;
    try {
      ws.close(1000, "client disconnect");
    } catch {
      // ignore
    }
    ws = null;
  }

  function sendMsg(msg: ClientToServer) {
    if (!ws || !store.isConnected) {
      log({
        kind: "error",
        ts: now(),
        message: "cannot send: websocket not connected",
      });
      return;
    }
    ws.send(JSON.stringify(msg));
  }

  function setConfig(config: AppConfig) {
    sendMsg({ op: "config:set", config });
  }

  function setRules(rules: Ruleset) {
    sendMsg({ op: "rules:set", rules });
  }

  return {
    connect,
    disconnect,
    setConfig,
    setRules,
  };
}
