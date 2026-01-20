import {
  AppConfigSchema,
  RulesetSchema,
  ThemeStateSchema,
  type AppConfig,
  type AppEvent,
  type EvaluatedEvent,
  type Ruleset,
  type ThemeState,
  type MessagePart,
  type PresentationPayload,
  type RenderLayer,
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
    seed?.config ?? AppConfigSchema.parse({ channel: "test", maxMessages: 50 });
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

        locales: {
          "alert.follow.title": "New follower",
          "alert.sub.title": "New subscriber",
          "alert.sub.gift_title": "Gift subscription",
          "alert.sub.details": "Tier {tier}, {months} months",
          "alert.raid.title": "Incoming raid",
          "alert.cheer.title": "Cheer",
          "chat.moderation.deleted": "Message deleted",
          "chat.placeholder.link": "[link]",
          "ui.viewers": "{count} viewers",
          "ui.bits": "{bits} bits",
        },
      },
    });

  const ruleset =
    seed?.ruleset ?? RulesetSchema.parse({ version: 1, rules: [] });

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

function t(
  locales: Record<string, string>,
  key: string,
  vars: Record<string, any> = {}
): MessagePart[] {
  let template = locales[key] || key;

  const numericValue = vars.count ?? vars.months ?? vars.bits ?? vars.viewers;

  if (template.includes("|") && typeof numericValue === "number") {
    const [plural, singular] = template.split("|");
    template = numericValue === 1 ? singular : plural;
  }

  for (const [k, v] of Object.entries(vars)) {
    template = template.replaceAll(`{${k}}`, String(v));
  }

  return [{ type: "text", content: template }];
}

function processLinks(parts: MessagePart[]): MessagePart[] {
  const urlRegex = /((?:https?:\/\/|www\.)[^\s]+)/g;
  const out: MessagePart[] = [];

  for (const part of parts) {
    if (part.type !== "text") {
      out.push(part);
      continue;
    }

    const tokens = part.content.split(urlRegex);
    for (const token of tokens) {
      if (!token) continue;
      if (/^(?:https?:\/\/|www\.)/i.test(token)) {
        out.push({ type: "link", url: token, text: token });
      } else {
        out.push({ type: "text", content: token });
      }
    }
  }
  return out;
}

function getPresentation(ev: AppEvent, theme: ThemeState): PresentationPayload {
  const l = theme.values.locales || {};
  const user = ev.user.displayName;

  const context: Record<string, any> = {
    user,
    displayName: user,
  };

  if (ev.kind === "twitch.sub") {
    context.tier = ev.tier;
    context.months = ev.months;
    context.count = ev.months;
  } else if (ev.kind === "twitch.raid") {
    context.viewers = ev.viewers;
    context.count = ev.viewers;
  } else if (ev.kind === "twitch.cheer") {
    context.bits = ev.bits;
    context.count = ev.bits;
  }

  switch (ev.kind) {
    case "chat.message":
      const isDeleted = (ev as any).isDeleted;
      return {
        layout: "chat",
        layers: [
          {
            id: "body",
            parts: isDeleted
              ? t(l, "chat.moderation.deleted", context)
              : ev.parts,
          },
        ],
      };

    case "twitch.follow":
      return {
        layout: "alert",
        styleHint: "twitch-follow",
        layers: [
          { id: "title", parts: t(l, "alert.follow.title", context) },
          { id: "message", parts: [{ type: "text", content: user }] },
        ],
      };

    case "twitch.sub":
      return {
        layout: "alert",
        styleHint: "twitch-sub",
        layers: [
          {
            id: "title",
            parts: t(
              l,
              ev.isGift ? "alert.sub.gift_title" : "alert.sub.title",
              context
            ),
          },
          { id: "message", parts: [{ type: "text", content: user }] },
          { id: "details", parts: t(l, "alert.sub.details", context) },
          ev.message
            ? { id: "content", parts: [{ type: "text", content: ev.message }] }
            : null,
        ].filter((layer): layer is RenderLayer => layer !== null),
      };

    case "twitch.raid":
      return {
        layout: "alert",
        styleHint: "twitch-raid",
        layers: [
          { id: "title", parts: t(l, "alert.raid.title", context) },
          { id: "message", parts: [{ type: "text", content: user }] },
          { id: "details", parts: t(l, "ui.viewers", context) },
        ],
      };

    case "twitch.cheer":
      return {
        layout: "alert",
        styleHint: "twitch-cheer",
        layers: [
          { id: "title", parts: t(l, "alert.cheer.title", context) },
          { id: "message", parts: t(l, "ui.bits", context) },
          {
            id: "details",
            parts: ev.message
              ? [{ type: "text", content: ev.message }]
              : [{ type: "text", content: user }],
          },
        ],
      };

    default:
      return { layout: "chat", layers: [] };
  }
}

export function evaluateEvent(state: State, ev: AppEvent): EvaluatedEvent {
  let next: AppEvent = { ...ev };
  let actions: any[] = [];

  if (next.kind === "chat.message") {
    const twitchData = (next.provider as any)?.twitch;
    const badgeTag = twitchData?.tags?.["badges"];
    if (badgeTag) {
      next.user.badges = resolveBadges(
        badgeTag,
        state.badgeMaps.global,
        state.badgeMaps.channel
      );
    }
    actions = state.engine.evaluate(next, Date.now());

    if (next.parts) {
      let parts = enrichMessageParts(next.parts, state.emoteMap);

      parts = processLinks(parts);

      if (actions.some((a) => a.type === "maskUrl")) {
        const linkPlaceholder =
          state.theme.values.locales?.["chat.placeholder.link"] || "[link]";
        parts = parts.map((p) =>
          p.type === "link" ? { type: "text", content: linkPlaceholder } : p
        );
      }
      next.parts = parts;
    }
  }

  return {
    event: next,
    actions,
    presentation: getPresentation(next, state.theme),
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
    safe.hasTwitchToken = !!safe.twitchToken && safe.twitchToken.length > 0;
    delete safe.twitchToken;
  }
  delete safe.apiKey;
  return safe;
}

export function validateConfig(input: unknown) {
  return AppConfigSchema.safeParse(input);
}
export function validateTheme(input: unknown) {
  return ThemeStateSchema.parse(input);
}
export function validateRuleset(input: unknown) {
  return RulesetSchema.safeParse(input);
}

export function setRuleset(state: State, ruleset: Ruleset) {
  state.ruleset = ruleset;
  state.engine = createRulesEngine(ruleset);
}
