import { z } from "zod";

export const ThemeStateSchema = z.object({
  activeThemeId: z.string().default("default"),

  values: z.record(z.string(), z.any()).default({
    fadeMs: 400,
    lifetimeMs: 30000,
    disappear: true,
    showNames: true,
    customCss: "",
    locales: {
      "alert.follow.title": "New follower",
      "alert.sub.title": "New subscriber",
      "alert.sub.details": "Tier {tier} • {months} months",
      "chat.moderation.deleted": "Message deleted",
      "chat.moderation.timeout": "{user} was timed out for {duration}s",
      "chat.placeholder.link": "[link]",
      "ui.viewers": "{count} viewers",
    },
  }),
});

export type ThemeState = z.infer<typeof ThemeStateSchema>;
