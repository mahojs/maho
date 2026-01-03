import type { AppConfig } from "./config";
import type { EvaluatedEvent } from "./actions";
import type { Ruleset } from "./rules";

export type ProtocolVersion = 1;
export type ClientRole = "overlay" | "control";

export type ClientHello = {
  op: "hello";
  role: ClientRole;
  protocolVersion: ProtocolVersion;
};

export type ConfigSet = { op: "config:set"; config: AppConfig };
export type ConfigChanged = {
  op: "config:changed";
  revision: number;
  config: AppConfig;
};
export type RulesSet = { op: "rules:set"; rules: Ruleset };
export type RulesChanged = {
  op: "rules:changed";
  revision: number;
  rules: Ruleset;
};
export type ServerState = {
  op: "state";
  revision: number;
  config: AppConfig;
  rules: Ruleset;
};
export type RuntimeEvent = {
  op: "event";
  revision: number;
  payload: EvaluatedEvent;
};
export type Replay = {
  op: "replay";
  events: { revision: number; payload: EvaluatedEvent }[];
};
export type ProtocolError = { op: "error"; message: string; details?: unknown };

export type ServerToClient =
  | ServerState
  | ConfigChanged
  | RulesChanged
  | RuntimeEvent
  | Replay
  | ProtocolError;

export type ClientToServer = ClientHello | ConfigSet | RulesSet;
