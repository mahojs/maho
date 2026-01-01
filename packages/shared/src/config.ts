export type AppConfig = {
  channel: string;
  maxMessages: number;
  disappear: boolean;
  lifetimeMs: number;
  fadeMs: number;
  showNames: boolean;
  hideLinks: boolean;
  blocklist: string[];
};
