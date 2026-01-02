import type { Platform, UserRole } from "./events";
import type { RenderAction } from "./actions";

export type Ruleset = {
  version: 1;
  rules: Rule[];
};

export type RuleMatch = {
  kind: "chat.message";
  matchAll?: boolean;
  platform?: Platform;
  userHasRole?: UserRole;
  textIncludes?: string;
  textRegex?: string;
};

export type Rule = {
  id: string;
  enabled: boolean;
  match: RuleMatch;
  actions: RenderAction[];
  cooldownMs?: number;
};
