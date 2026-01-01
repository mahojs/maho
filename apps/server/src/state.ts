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

export const ServerDefaultConfig: AppConfig = {
    channel: "test",
    maxMessages: 10,
    disappear: true,
    lifetimeMs: 30000,
    fadeMs: 400,
    showNames: true,
    hideLinks: false,
    blocklist: []
};

export const ServerDefaultRuleset: Ruleset = {
    version: 1,
    rules: [],
};

export function createIntiialState(): State {
    return {
        config: ServerDefaultConfig,
        ruleset: ServerDefaultRuleset,
        engine: createRulesEngine(ServerDefaultRuleset),
    };
}

export function applyHideLinks(text: string): string {
    return text.replace(/https?:\/\/\S+/gi, "[link]");
}

export function isBlocked(text: string, cfg: AppConfig): boolean {
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
                return { event: next, actions: [{ type: "suppress" }]};
            }
            const actions = state.engine.evaluate(next, Date.now());
            return { event: next, actions };
        }
        default:
            return { event: ev, actions: [] };
    }
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