import {
  AppConfigSchema,
  RulesetSchema,
  type AppConfig,
  type Ruleset,
} from "@maho/shared";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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

export function resolveDataDir(): string {
  // temp local ./data
  return process.env.MAHO_DATA_DIR ?? path.resolve(process.cwd(), "data");
}

export function resolveStateFile(dataDir: string): string {
  return path.join(dataDir, "state.json");
}

export async function loadOrCreateStateFile(opts?: {
  dataDir?: string;
  defaults?: PersistedStateV1;
}): Promise<{ dataDir: string; filePath: string; state: PersistedStateV1 }> {
  const dataDir = opts?.dataDir ?? resolveDataDir();
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

export async function saveStateFile(
  filePath: string,
  state: PersistedStateV1
): Promise<void> {
  await writeFile(filePath, JSON.stringify(state, null, 2), "utf8");
}
