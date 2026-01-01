import type {
    ClientRole,
    ClientToServer,
    ProtocolVersion,
    ServerToClient,
} from "@maho/shared";
import { validateConfig, validateRuleset, setRuleset, type State } from "./state";
import { ServerWebSocket } from "bun";

export type WsHub = {
    clients: Set<ServerWebSocket<unknown>>;
    roles: WeakMap<ServerWebSocket<unknown>, ClientRole>;
    broadcast: (msg: ServerToClient) => void;
    send: (ws: ServerWebSocket<unknown>, msg: ServerToClient) => void;
    onMessage: (ws: ServerWebSocket<unknown>, raw: unknown) => void;
    onOpen: (ws: ServerWebSocket<unknown>) => void;
    onClose: (ws: ServerWebSocket<unknown>) => void;
};

export function createWsHub(state: State, supportedProtocol: ProtocolVersion): WsHub {
    const clients = new Set<ServerWebSocket<unknown>>();
    const roles = new WeakMap<ServerWebSocket<unknown>, ClientRole>();
    function send(ws: ServerWebSocket<unknown>, msg: ServerToClient) {
        ws.send(JSON.stringify(msg));
    }
    function broadcast(msg: ServerToClient) {
        const s = JSON.stringify(msg);
        for (const ws of clients) ws.send(s);
    }
    function requireHello(ws: ServerWebSocket<unknown>): boolean {
        return typeof roles.get(ws) !== "undefined";
    }
    function requireControl(ws: ServerWebSocket<unknown>): boolean {
        return roles.get(ws) === "control";
    }
    function onOpen(ws: ServerWebSocket<unknown>) {
        clients.add(ws);
        send(ws, { op: "state", config: state.config, rules: state.ruleset });
    }
    function onClose(ws: ServerWebSocket<unknown>) {
        clients.delete(ws);
        roles.delete(ws);
    }
    function onMessage(ws: ServerWebSocket<unknown>, raw: unknown) {
        let msg: ClientToServer;
        try {
            msg = JSON.parse(String(raw));
        } catch {
            send(ws, { op: "error", message: "invalid JSON" });
            return;
        }

        if (msg.op === "hello") {
            if (msg.protocolVersion !== supportedProtocol ){
                send(ws, {
                    op: "error",
                    message: `unsupported protocolVersion ${msg.protocolVersion}, server supports ${supportedProtocol}`
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
                send(ws, { op: "error", message: "only control clients can set config"});
                return;
            }
            const parsed = validateConfig(msg.config);
            if (!parsed.success) {
                send(ws, { op: "error", message: "invalid config", details: parsed.error.flatten() });
                return;
            }
            state.config = parsed.data;
            broadcast({ op: "config:changed", config: state.config });
            return;
        }

        if (msg.op === "rules:set") {
            if (!requireControl(ws)) {
                send(ws, { op: "error", message: "only control clients can set config"});
                return;
            }
            const parsed = validateRuleset(msg.rules);
            if (!parsed.success) {
                send(ws, { op: "error", message: "invalid config", details: parsed.error.flatten() });
                return;
            }
            setRuleset(state, parsed.data);
            broadcast({ op: "rules:changed", rules: state.ruleset });
            return;
        }
        send(ws, { op: "error", message: "unknown op" });
    }
    return { clients, roles, broadcast, send, onMessage, onOpen, onClose };
}