export type AppConfig = {
  channel: string;
  apiKey?: string;
  twitchUsername?: string;
  twitchToken?: string;
  hasTwitchToken?: boolean;
  seventvUserId?: string;
  maxMessages: number;
  disappear: boolean;
  lifetimeMs: number;
  fadeMs: number;
  showNames: boolean;
  hideLinks: boolean;
  blocklist: string[];
  customCss: string;
};
