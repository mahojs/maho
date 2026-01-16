import type { AppConfig } from "./config";
import type { EvaluatedEvent } from "./actions";
import type { Ruleset } from "./rules";

export type ProtocolVersion = 1;

export type ClientRole = "overlay" | "control";

export type ConfigPatch = Partial<AppConfig>;

export type ClientHello = {
  op: "hello";
  role: ClientRole;
  protocolVersion: ProtocolVersion;
  apiKey?: string;
};

export type ConfigPatchOp = { op: "config:patch"; patch: ConfigPatch };

export type ConfigChanged = {
  op: "config:changed";
  rev: number;
  patch: ConfigPatch;
};

export type RulesSet = { op: "rules:set"; rules: Ruleset };

export type RulesChanged = {
  op: "rules:changed";
  rev: number;
  rules: Ruleset;
};

export type ServerState = {
  op: "state";
  config: {
    rev: number;
    data: AppConfig;
  }
  rules: {
    rev: number;
    data: Ruleset;
  }
};

export type RuntimeEvent = {
  op: "event";
  seq: number;
  payload: EvaluatedEvent;
};

export type Replay = {
  op: "replay";
  events: { seq: number; payload: EvaluatedEvent }[];
};

export type ProtocolError = { op: "error"; message: string; details?: unknown };

export type ControlNotice = {
  op: "control:notice";
  rev?: number; // optional context rev
  level: "info" | "warn" | "error";
  message: string;
  details?: unknown;
};

export type ServerToClient =
  | ServerState
  | ConfigChanged
  | RulesChanged
  | RuntimeEvent
  | Replay
  | ProtocolError
  | ControlNotice;

export type ClientToServer = ClientHello | ConfigPatchOp | RulesSet;
