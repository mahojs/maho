import type { Platform, UserRole } from "./events";

export type Ruleset = {
  version: 1;
  rules: Rule[];
};

export type Rule = {
  id: string;
  enabled: boolean;

  match: RuleMatch;
  actions: RuleAction[];

  cooldownMs?: number;
};

export type RuleMatch = {
  kind: "chat.message";
  matchAll?: boolean;
  platform: Platform;
  userHasRole?: UserRole;
  textIncludes?: string;
  textRegex?: string;
};

export type RuleAction =
  | { type: "addClass"; value: string }
  | { type: "setVar"; name: string; value: string }
  | { type: "suppress" };
