import { z } from "zod";
import { PlatformSchema, UserRoleSchema } from "./events";

export const RuleMatchSchema = z
  .object({
    kind: z.literal("chat.message"),
    matchAll: z.boolean().optional(),
    platform: PlatformSchema.optional(),
    userHasRole: UserRoleSchema.optional(),
    textIncludes: z.string().min(1).optional(),
    textRegex: z.string().min(1).max(200).optional(),
  })
  .refine(
    (m) => {
      if (m.matchAll) return true;
      return !!(m.platform || m.userHasRole || m.textIncludes || m.textRegex);
    },
    {
      message:
        "Rule match must specify at least one condition unless matchAll is true",
    }
  );

export const RenderActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("addClass"), value: z.string().min(1) }),
  z.object({
    type: z.literal("setVar"),
    name: z.string().min(1),
    value: z.string(),
  }),
  z.object({ type: z.literal("suppress") }),
  z.object({ type: z.literal("maskUrl") }),
]);

export const RuleSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean().default(true),
  match: RuleMatchSchema,
  actions: z.array(RenderActionSchema).default([]),
  cooldownMs: z.number().int().min(0).max(1000000).optional(),
});

export const RulesetSchema = z.object({
  version: z.literal(1),
  rules: z.array(RuleSchema).default([]),
});

export const DefaultRuleset = RulesetSchema.parse({
  version: 1,
  rules: [],
});

export type Rule = z.infer<typeof RuleSchema>;
export type Ruleset = z.infer<typeof RulesetSchema>;
