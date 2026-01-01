import type { AppConfig } from "./config";
import type { EvaluatedEvent } from "./actions";
import type { Ruleset } from "./rules";

export type ProtocolVersion = 1;
export type ClientRole = "overlay" | "control";
export type ClientHello = {
    op: "hello";
    role: ClientRole;
    protocolVersion: ProtocolVersion;
    clientId?: string;
};

export type ConfigSet = {
    op: "config:set";
    config: AppConfig;
};

export type ConfigChanged = {
    op: "config:changed";
    config: AppConfig
}

export type RulesSet = {
    op: "rules:set";
    config: AppConfig
}

export type RulesChanged = {
    op: "rules:changed";
    config: AppConfig
}

export type ServerState = {
    op: "state";
    config: AppConfig;
    rules: RulesSet;
}

export type RuntimeEvent = {
    op: "event";
    payload: EvaluatedEvent;
}

export type ProtocolError = {
    op: "error";
    message: string;
    details?: unknown;
};

export type ServerToClient =
    | ServerState
    | ConfigChanged
    | RulesChanged
    | RuntimeEvent
    | ProtocolError;

export type ClientToServer = ClientHello | ConfigSet | RulesSet;