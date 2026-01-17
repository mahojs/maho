import { z } from "zod";

export const AppConfigSchema = z.object({
  // connection
  channel: z.string().min(1),

  // auth fields
  apiKey: z.string().optional(),
  twitchUsername: z.string().optional(),
  twitchToken: z.string().optional(),

  hasTwitchToken: z.boolean().optional(),

  // integrations
  seventvUserId: z.string().optional(),

  // hard system limit for server memory allocation 
  maxMessages: z.number().int().min(1).max(100).default(50),
});

export const DefaultConfig = AppConfigSchema.parse({
  channel: "test",
  twitchUsername: "",
  twitchToken: "",
  seventvUserId: "",
  maxMessages: 50,
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
