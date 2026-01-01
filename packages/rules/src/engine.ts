import type { AppEvent, ChatMessageEvent, RenderAction, Ruleset, UserRole } from "@maho/shared";

export type RulesEngine = {
    evaluate: (ev: AppEvent, now: number) => RenderAction[];
};

function safeRegex(pattern: string): RegExp | null {
    try{
        return new RegExp(pattern, "i");
    } catch {
        return null;
    }
}

function includesCI(haystack: string, needle: string): boolean {
    return haystack.toLowerCase().includes(needle.toLowerCase());
}

function hasRole(userRoles: UserRole[], role: UserRole): boolean {
    return userRoles.includes(role);
}

type CompiledRule = {
    id: string,
    enabled: boolean;
    cooldownMs: number;

    match: {
        kind: "chat.message";
        matchAll: boolean;
        platform?: "twitch";
        userHasRole?: UserRole;
        textIncludes?: string;
        textRegex?: RegExp | null;
    };

    actions: RenderAction[];
};

export function createRulesEngine(ruleset: Ruleset): RulesEngine {
    const cooldowns = new Map<string, number>();

    const compiled: CompiledRule[] = ruleset.rules.map((r) => ({
        id: r.id,
        enabled: r.enabled,
        cooldownMs: r.cooldownMs ?? 0,
        match: {
            kind: r.match.kind,
            matchAll: r.match.matchAll ?? false,
            platform: r.match.platform,
            userHasRole: r.match.userHasRole,
            textIncludes: r.match.textIncludes,
            textRegex: r.match.textRegex ? safeRegex(r.match.textRegex) : undefined,
        },
        actions: r.actions as RenderAction[],
    }));

    function matchesChat(rule: CompiledRule, ev: ChatMessageEvent): boolean {
        const m = rule.match;
        if (m.platform && m.platform !== ev.platform) return false;
        if (m.matchAll) return true;
        if (m.userHasRole && !hasRole(ev.user.roles, m.userHasRole)) return false;
        if (m.textIncludes && !includesCI(ev.text, m.textIncludes)) return false;
        if (typeof m.textRegex !== "undefined") {
            if (!m.textRegex) return false;
            if (!m.textRegex.test(ev.text)) return false;
        }
        return true;
    }

    return {
        evaluate(ev, now) {
            const out: RenderAction[] = [];
            for (const rule of compiled) {
                if (!rule.enabled) continue;
                const nextAllowed = cooldowns.get(rule.id) ?? 0;
                if (now < nextAllowed) continue;
                if (rule.match.kind !== ev.kind) continue;
                let ok = false;
                if (ev.kind === "chat.message") ok = matchesChat(rule, ev);
                if (!ok) continue;
                out.push(...rule.actions);
                if (rule.cooldownMs > 0) {
                    cooldowns.set(rule.id, now + rule.cooldownMs);
                }
            }
            return out;
        }
    }
}