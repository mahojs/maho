import { z } from "zod";

export const AppConfigSchema = z.object({
    channel: z.string().min(1),
    maxMessages: z.number().int().min(1).max(50),
    disappear: z.boolean(),
    lifetimeMs: z.number().int().min(1000).max(300000),
    fadeMs: z.number().int().min(0).max(10000),
    showNames: z.boolean(),
    hideLinks: z.boolean(),
    blocklist: z.array(z.string()).default([]),
})

// todo: default config