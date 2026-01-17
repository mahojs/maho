import {
  AppConfigSchema,
  RulesetSchema,
  type AppConfig,
  type Ruleset,
} from "@maho/shared";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export type PersistedStateV1 = {
  version: 1;
  config: AppConfig;
  rules: Ruleset;
};

export const DEFAULT_PERSISTED_STATE: PersistedStateV1 = {
  version: 1,
  config: {
    channel: "example_channel",
    maxMessages: 7,
    disappear: true,
    lifetimeMs: 30000,
    fadeMs: 400,
    showNames: true,
    hideLinks: false,
    blocklist: [],
    customCss: "",
  },
  rules: {
    version: 1,
    rules: [],
  },
};

function parsePersistedStateV1(input: unknown): PersistedStateV1 {
  if (!input || typeof input !== "object") {
    throw new Error("state.json: expected object");
  }
  const obj = input as any;

  if (obj.version !== 1) {
    throw new Error(`state.json: unsupported version ${obj.version}`);
  }

  const config = AppConfigSchema.parse(obj.config);
  const rules = RulesetSchema.parse(obj.rules);

  return { version: 1, config, rules };
}

export function resolveAppDataPath(): string {
  // allow CLI override via env var
  if (process.env.MAHO_DATA_DIR) {
    return process.env.MAHO_DATA_DIR;
  }

  const home = os.homedir();
  const platform = os.platform();

  // windows: %APPDATA%/maho
  if (platform === "win32") {
    return path.join(
      process.env.APPDATA ?? path.join(home, "AppData", "Roaming"),
      "maho"
    );
  }

  // mac: ~/Library/Application Support/maho
  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", "maho");
  }

  // linux: ~/.config/maho
  const configHome = process.env.XDG_CONFIG_HOME ?? path.join(home, ".config");
  return path.join(configHome, "maho");
}

export function resolveStateFile(dataDir: string): string {
  return path.join(dataDir, "state.json");
}

export async function loadOrCreateStateFile(opts?: {
  dataDir?: string;
  defaults?: PersistedStateV1;
}): Promise<{ dataDir: string; filePath: string; state: PersistedStateV1 }> {
  const dataDir = opts?.dataDir ?? resolveAppDataPath();
  const filePath = resolveStateFile(dataDir);
  const defaults = opts?.defaults ?? DEFAULT_PERSISTED_STATE;

  await mkdir(dataDir, { recursive: true });

  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const state = parsePersistedStateV1(parsed);
    return { dataDir, filePath, state };
  } catch (e: any) {
    if (e && (e.code === "ENOENT" || e.code === "ENOTDIR")) {
      await writeFile(filePath, JSON.stringify(defaults, null, 2), "utf8");
      return { dataDir, filePath, state: defaults };
    }

    throw new Error(`failed to load ${filePath}: ${String(e)}`);
  }
}

export function createPersistor(filePath: string, debounceMs = 2000) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: PersistedStateV1 | null = null;

  const writeNow = async () => {
    if (!pending) return;
    const data = JSON.stringify(pending, null, 2);

    pending = null;
    timer = null;

    try {
      await writeFile(filePath, data, "utf8");
      console.debug(`[store] state saved to ${path.basename(filePath)}`);
    } catch (e) {
      console.error(`[store] failed to save state to ${filePath}`, e);
    }
  };

  return {
    schedule(state: PersistedStateV1) {
      pending = state;
      if (!timer) {
        timer = setTimeout(writeNow, debounceMs);
      }
    },

    flush: async () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await writeNow();
    },
  };
}
