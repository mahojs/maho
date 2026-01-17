import type { AppConfig } from "./schema/config";
import type { EvaluatedEvent } from "./actions";
import type { Ruleset } from "./schema/rules";
import type { ThemeState } from "./schema/theme";

export type ProtocolVersion = 1;

export type ClientRole = "overlay" | "control";

export type ConfigPatch = Partial<AppConfig>;

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

export type ThemePatch = {
  activeThemeId?: string;
  values?: Record<string, any>;
};

export type ThemePatchOp = { op: "theme:patch"; patch: ThemePatch };

export type ThemeChanged = {
  op: "theme:changed";
  rev: number;
  patch: ThemePatch;
};

export type ClientHello = {
  op: "hello";
  role: ClientRole;
  protocolVersion: ProtocolVersion;
  apiKey?: string;
};

export type ServerState = {
  op: "state";
  config: { rev: number; data: AppConfig };
  rules: { rev: number; data: Ruleset };
  theme: { rev: number; data: ThemeState };
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
  rev?: number;
  level: "info" | "warn" | "error";
  message: string;
  details?: unknown;
};

export type ServerToClient =
  | ServerState
  | ConfigChanged
  | RulesChanged
  | ThemeChanged
  | RuntimeEvent
  | Replay
  | ProtocolError
  | ControlNotice;

export type ClientToServer = ClientHello | ConfigPatchOp | RulesSet | ThemePatchOp;