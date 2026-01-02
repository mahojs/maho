export type AppConfig = {
  channel: string;
  seventvEmoteSetId?: string;
  maxMessages: number;
  disappear: boolean;
  lifetimeMs: number;
  fadeMs: number;
  showNames: boolean;
  hideLinks: boolean;
  blocklist: string[];
};
