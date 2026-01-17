import { z } from "zod";

export const ThemeStateSchema = z.object({
  activeThemeId: z.string().default("default"),

  // generic values for overlay
  values: z.record(z.string(), z.any()).default({
    fadeMs: 400,
    lifetimeMs: 30000,
    disappear: true,
    showNames: true,
    customCss: "",
  }),
});

export type ThemeState = z.infer<typeof ThemeStateSchema>;
