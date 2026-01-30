import { defineStore } from "pinia";
import type { AppConfig, Ruleset, ThemeState } from "@maho/shared";

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
      rev?: number;
      level: "info" | "warn" | "error";
      message: string;
      details?: unknown;
    }
  | {
      kind: "error";
      ts: number;
      rev?: number;
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

    configRevision: -1,
    rulesRevision: -1,
    themeRevision: -1,

    serverConfig: null as AppConfig | null,
    serverRules: null as Ruleset | null,
    serverTheme: null as ThemeState | null,

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

    updateState(
      config: { rev: number; data: AppConfig },
      rules: { rev: number; data: Ruleset },
      theme: { rev: number; data: ThemeState }
    ) {
      if (config.rev >= this.configRevision) {
        this.configRevision = config.rev;
        this.serverConfig = config.data;
      }
      if (rules.rev >= this.rulesRevision) {
        this.rulesRevision = rules.rev;
        this.serverRules = rules.data;
      }
      if (theme.rev >= this.themeRevision) {
        this.themeRevision = theme.rev;
        this.serverTheme = theme.data;
      }
      this.lastError = undefined;
    },

    updateConfig(rev: number, patch: Partial<AppConfig>) {
      if (rev < this.configRevision) return;
      this.configRevision = rev;
      if (this.serverConfig) {
        this.serverConfig = { ...this.serverConfig, ...patch };
      }
    },

    updateRules(rev: number, rules: Ruleset) {
      if (rev < this.rulesRevision) return;
      this.rulesRevision = rev;
      this.serverRules = rules;
    },

    updateTheme(rev: number, patch: Partial<ThemeState>) {
      if (rev < this.themeRevision) return;
      this.themeRevision = rev;
      if (this.serverTheme) {
        const nextValues = patch.values
          ? { ...this.serverTheme.values, ...patch.values }
          : this.serverTheme.values;

        this.serverTheme = {
          ...this.serverTheme,
          ...patch,
          values: nextValues,
        };
      }
    },

    pushLog(entry: ControlLogEntry) {
      this.log.unshift(entry);
      if (this.log.length > MAX_LOG) this.log.length = MAX_LOG;
    },
  },
});
