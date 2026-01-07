import { defineStore } from "pinia";
import type { AppConfig, Ruleset } from "@maho/shared";

export type WsStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

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

const MAX_LOG = 200;

export const useServerStore = defineStore("server", {
  state: () => ({
    status: "idle" as WsStatus,
    lastError: undefined as string | undefined,

    revision: -1,
    serverConfig: null as AppConfig | null,
    serverRules: null as Ruleset | null,

    log: [] as ControlLogEntry[],
  }),

  getters: {
    isConnected: (state) => state.status === "connected",
    isConnecting: (state) => state.status === "connecting",
  },

  actions: {
    setStatus(s: WsStatus) {
      this.status = s;
    },

    setError(msg: string) {
      this.lastError = msg;
      this.status = "error";
    },

    clearError() {
      this.lastError = undefined;
    },

    updateState(revision: number, config: AppConfig, rules: Ruleset) {
      if (revision < this.revision) return;
      this.revision = revision;
      this.serverConfig = config;
      this.serverRules = rules;
      this.lastError = undefined;
    },

    updateConfig(revision: number, config: AppConfig) {
      if (revision < this.revision) return;
      this.revision = revision;
      this.serverConfig = config;
      this.lastError = undefined;
    },

    updateRules(revision: number, rules: Ruleset) {
      if (revision < this.revision) return;
      this.revision = revision;
      this.serverRules = rules;
      this.lastError = undefined;
    },

    pushLog(entry: ControlLogEntry) {
      this.log.unshift(entry);
      if (this.log.length > MAX_LOG) this.log.length = MAX_LOG;
    },
  },
});
