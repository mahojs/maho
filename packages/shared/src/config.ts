export type AppConfig = {
  channel: string;
  twitchUsername?: string;
  twitchToken?: string;
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
