import {
  AppConfigSchema,
  RulesetSchema,
  ThemeStateSchema,
  type AppConfig,
  type Ruleset,
  type ThemeState,
} from "@maho/shared";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export type PersistedStateV1 = {
  version: 1;
  config: AppConfig;
  rules: Ruleset;
  theme: ThemeState;
};

export const DEFAULT_PERSISTED_STATE: PersistedStateV1 = {
  version: 1,
  config: {
    channel: "test",
    maxMessages: 50,
    twitchUsername: "",
    twitchToken: "",
    seventvUserId: "",
  },
  rules: {
    version: 1,
    rules: [
      {
        id: "system-hide-links",
        enabled: false,
        match: { kind: "chat.message", textRegex: "(https?://|www\\.)\\S+" },
        actions: [{ type: "maskUrl" }],
      },
    ],
  },
  theme: {
    activeThemeId: "default",
    values: {
      fadeMs: 400,
      lifetimeMs: 30000,
      disappear: true,
      showNames: true,
      customCss: "",
    },
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
  const theme = ThemeStateSchema.parse(obj.theme);

  return { version: 1, config, rules, theme };
}

export function resolveAppDataPath(): string {
  if (process.env.MAHO_DATA_DIR) {
    return process.env.MAHO_DATA_DIR;
  }

  const home = os.homedir();
  const platform = os.platform();

  if (platform === "win32") {
    return path.join(
      process.env.APPDATA ?? path.join(home, "AppData", "Roaming"),
      "maho"
    );
  }

  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", "maho");
  }

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

    let state: PersistedStateV1;
    try {
      state = parsePersistedStateV1(parsed);
    } catch {
      // fallback migration (dev)
      if (parsed.config && parsed.rules && !parsed.theme) {
        console.warn("[store] migrating state: adding missing theme lane");
        state = {
          version: 1,
          config: AppConfigSchema.parse(parsed.config),
          rules: RulesetSchema.parse(parsed.rules),
          theme: defaults.theme,
        };
      } else {
        throw new Error("state invalid");
      }
    }

    return { dataDir, filePath, state };
  } catch (e: any) {
    if (e && (e.code === "ENOENT" || e.code === "ENOTDIR")) {
      await writeFile(filePath, JSON.stringify(defaults, null, 2), "utf8");
      return { dataDir, filePath, state: defaults };
    }

    console.error(`[store] state load failed: ${e.message}. Using defaults.`);
    // backup corrupted file?
    return { dataDir, filePath, state: defaults };
  }
}

export function createPersistor(filePath: string, debounceMs = 2000) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: PersistedStateV1 | null = null;

  const writeNow = async () => {
    if (!pending) return;
    const data = JSON.stringify(pending, null, 2);

    const dataToWrite = pending;
    pending = null;
    timer = null;

    try {
      await writeFile(filePath, data, "utf8");
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
