import { z } from "zod";

export const AppConfigSchema = z.object({
  channel: z.string().min(1),
  
  // auth fields
  twitchUsername: z.string().optional(),
  twitchToken: z.string().optional(),

  seventvUserId: z.string().optional(),
  maxMessages: z.number().int().min(1).max(50),
  disappear: z.boolean(),
  lifetimeMs: z.number().int().min(1000).max(300000),
  fadeMs: z.number().int().min(0).max(10000),
  showNames: z.boolean(),
  hideLinks: z.boolean(),
  blocklist: z.array(z.string()).default([]),
  customCss: z.string().default(""),
});

export const DefaultConfig = AppConfigSchema.parse({
  channel: "test",
  twitchUsername: "",
  twitchToken: "",
  seventvUserId: "",
  maxMessages: 10,
  disappear: true,
  lifetimeMs: 30000,
  fadeMs: 400,
  showNames: true,
  hideLinks: false,
  blocklist: [],
  customCss: "",
});
