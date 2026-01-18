import {
  AppConfigSchema,
  RulesetSchema,
  ThemeStateSchema,
  type AppConfig,
  type AppEvent,
  type ChatMessageEvent,
  type EvaluatedEvent,
  type Ruleset,
  type ThemeState,
  type MessagePart,
} from "@maho/shared";
import { createRulesEngine, type RulesEngine } from "@maho/rules";
import { EmoteMap, enrichMessageParts } from "./emotes";
import { BadgeMap, resolveBadges } from "./badges";

export type State = {
  // config
  config: AppConfig;
  configRevision: number;

  // rules
  ruleset: Ruleset;
  rulesRevision: number;
  engine: RulesEngine;

  // themes
  theme: ThemeState;
  themeRevision: number;

  // event
  eventSequence: number;
  eventLog: { seq: number; payload: EvaluatedEvent }[];
  eventLogMax: number;

  // resources
  emoteMap: EmoteMap;
  badgeMaps: { global: BadgeMap; channel: BadgeMap };
};

export function createInitialState(seed?: {
  config?: AppConfig;
  ruleset?: Ruleset;
  theme?: ThemeState;
}): State {
  const config =
    seed?.config ??
    AppConfigSchema.parse({
      channel: "test",
      apiKey: crypto.randomUUID(),
      maxMessages: 50, // Only infra limit remains
    });

  const theme =
    seed?.theme ??
    ThemeStateSchema.parse({
      activeThemeId: "default",
      values: {
        fadeMs: 400,
        lifetimeMs: 30000,
        disappear: true,
        showNames: true,
        customCss: "",
      },
    });

  const ruleset =
    seed?.ruleset ??
    RulesetSchema.parse({
      version: 1,
      rules: [
        // System Rule: Link Hiding (Disabled by default)
        {
          id: "system-hide-links",
          enabled: false,
          match: { kind: "chat.message", textRegex: "(https?://|www\\.)\\S+" },
          actions: [{ type: "maskUrl" }],
        },
      ],
    });

  return {
    config,
    configRevision: 0,
    ruleset,
    rulesRevision: 0,
    engine: createRulesEngine(ruleset),
    theme,
    themeRevision: 0,
    eventSequence: 0,
    emoteMap: new Map(),
    badgeMaps: { global: new Map(), channel: new Map() },
    eventLog: [],
    eventLogMax: 200,
  };
}

export function sanitizeConfig(cfg: AppConfig): AppConfig {
  const safe = { ...cfg };
  safe.hasTwitchToken = !!safe.twitchToken;

  delete safe.twitchToken;
  delete safe.apiKey;

  return safe;
}

export function sanitizePatch(patch: Partial<AppConfig>): Partial<AppConfig> {
  const safe = { ...patch };

  if ("twitchToken" in safe) {
    const val = safe.twitchToken;
    safe.hasTwitchToken = !!val && val.length > 0;
    delete safe.twitchToken;
  }

  delete safe.apiKey;
  return safe;
}

export function validateConfig(input: unknown) {
  return AppConfigSchema.safeParse(input);
}

export function validateTheme(input: unknown) {
  return ThemeStateSchema.safeParse(input);
}
export function sanitizeTheme(t: ThemeState) {
  return t;
}

export function validateRuleset(input: unknown) {
  return RulesetSchema.safeParse(input);
}

export function setRuleset(state: State, ruleset: Ruleset) {
  state.ruleset = ruleset;
  state.engine = createRulesEngine(ruleset);
}

function isUrl(s: string): boolean {
  return /^(?:https?:\/\/|www\.)/i.test(s);
}

function processLinks(parts: MessagePart[], hide: boolean): MessagePart[] {
  const out: MessagePart[] = [];
  const urlRegex = /((?:https?:\/\/|www\.)[^\s]+)/g;

  for (const part of parts) {
    if (part.type !== "text") {
      out.push(part);
      continue;
    }

    const tokens = part.content.split(urlRegex);

    for (const token of tokens) {
      if (!token) continue;

      if (isUrl(token)) {
        if (hide) {
          out.push({ type: "text", content: "[link]" });
        } else {
          const url = token.startsWith("www.") ? `https://${token}` : token;
          out.push({ type: "link", url, text: token });
        }
      } else {
        out.push({ type: "text", content: token });
      }
    }
  }
  return out;
}

export function evaluateEvent(state: State, ev: AppEvent): EvaluatedEvent {
  if (ev.kind !== "chat.message") {
    return { event: ev, actions: [] };
  }

  let next: ChatMessageEvent = ev;

  // 1. Resolve Badges
  const twitchData = (next.provider as Record<string, any> | undefined)?.twitch as
    | { tags?: Record<string, string> }
    | undefined;
  const badgeTag = twitchData?.tags?.["badges"];

  if (badgeTag) {
    next.user.badges = resolveBadges(
      badgeTag,
      state.badgeMaps.global,
      state.badgeMaps.channel
    );
  }

  // 2. Run Rules Engine
  const actions = state.engine.evaluate(next, Date.now());

  let maskLinks = false;

  for (const a of actions) {
    if (a.type === "maskUrl") maskLinks = true;
  }

  // 3. Process Content (Emotes & Links)
  if (next.parts) {
    let processedParts = enrichMessageParts(next.parts, state.emoteMap);
    processedParts = processLinks(processedParts, maskLinks);
    next = { ...next, parts: processedParts };
  }

  return { event: next, actions };
}