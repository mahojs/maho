import {
  AppConfigSchema,
  RulesetSchema,
  type AppConfig,
  type AppEvent,
  type ChatMessageEvent,
  type EvaluatedEvent,
  type Ruleset,
} from "@maho/shared";
import { createRulesEngine, type RulesEngine } from "@maho/rules";

export type State = {
  config: AppConfig;
  ruleset: Ruleset;
  engine: RulesEngine;
};

export function createInitialState(seed?: {
  config: AppConfig;
  ruleset: Ruleset;
}): State {
  const config =
    seed?.config ??
    AppConfigSchema.parse({
      channel: "test",
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
    ruleset,
    engine: createRulesEngine(ruleset),
  };
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

function applyHideLinks(text: string): string {
  return text.replace(/https?:\/\/\S+/gi, "[link]");
}

function isBlocked(text: string, cfg: AppConfig): boolean {
  if (!cfg.blocklist.length) return false;
  const lower = text.toLowerCase();
  return cfg.blocklist.some((w) => {
    const s = w.trim();
    return s.length > 0 && lower.includes(s.toLowerCase());
  });
}

export function evaluateEvent(state: State, ev: AppEvent): EvaluatedEvent {
  switch (ev.kind) {
    case "chat.message": {
      let next: ChatMessageEvent = ev;
      if (state.config.hideLinks) {
        const t = applyHideLinks(next.text);
        if (t !== next.text) next = { ...next, text: t };
      }
      if (isBlocked(next.text, state.config)) {
        return { event: next, actions: [{ type: "suppress" }] };
      }
      const actions = state.engine.evaluate(next, Date.now());
      return { event: next, actions };
    }
    default:
      return { event: ev, actions: [] };
  }
}
