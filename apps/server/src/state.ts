import {
  AppConfigSchema,
  RulesetSchema,
  type AppConfig,
  type AppEvent,
  type ChatMessageEvent,
  type EvaluatedEvent,
  type Ruleset,
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

  // event
  eventSequence: number;
  eventLog: { seq: number; payload: EvaluatedEvent }[];
  eventLogMax: number;

  // resources
  emoteMap: EmoteMap;
  badgeMaps: { global: BadgeMap; channel: BadgeMap };
};

export function createInitialState(seed?: {
  config: AppConfig;
  ruleset: Ruleset;
}): State {
  const config =
    seed?.config ??
    AppConfigSchema.parse({
      channel: "test",
      apiKey: crypto.randomUUID(),
      maxMessages: 10,
      disappear: true,
      lifetimeMs: 30000,
      fadeMs: 400,
      showNames: true,
      hideLinks: false,
      blocklist: [],
    });

  const ruleset =
    seed?.ruleset ??
    RulesetSchema.parse({
      version: 1,
      rules: [],
    });

  return {
    config,
    configRevision: 0,
    ruleset,
    rulesRevision: 0,
    engine: createRulesEngine(ruleset),
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

export function validateRuleset(input: unknown) {
  return RulesetSchema.safeParse(input);
}

export function setRuleset(state: State, ruleset: Ruleset) {
  state.ruleset = ruleset;
  state.engine = createRulesEngine(ruleset);
}

function isBlocked(text: string, cfg: AppConfig): boolean {
  if (!cfg.blocklist.length) return false;
  const lower = text.toLowerCase();
  return cfg.blocklist.some((w) => {
    const s = w.trim();
    return s.length > 0 && lower.includes(s.toLowerCase());
  });
}

function isUrl(s: string): boolean {
  return /^(?:https?:\/\/|www\.)/i.test(s);
}

function processLinks(parts: MessagePart[], hide: boolean): MessagePart[] {
  const out: MessagePart[] = [];
  /* 
  ( ... )           capturing group so .split() includes separators in result array
  (?: ... )         non-capturing group for the OR logic
  https?:\/\/       matches http:// or https://
  |                 OR
  www\.             matches www. literal
  [^\s]+            matches one or more non-whitespace characters */
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
  switch (ev.kind) {
    case "chat.message": {
      let next: ChatMessageEvent = ev;

      const twitchData = next.provider?.twitch as
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

      if (isBlocked(next.text, state.config)) {
        return { event: next, actions: [{ type: "suppress" }] };
      }

      const actions = state.engine.evaluate(next, Date.now());

      if (next.parts) {
        let processedParts = enrichMessageParts(next.parts, state.emoteMap);
        processedParts = processLinks(processedParts, state.config.hideLinks);
        next = { ...next, parts: processedParts };
      }

      return { event: next, actions };
    }
    default:
      return { event: ev, actions: [] };
  }
}
