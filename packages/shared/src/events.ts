import { StringLike } from "bun";

export type Platform = "twitch";
export type UserRole = "broadcaster" | "mod" | "vip" | "sub" | "member";
export type ChatUser = {
  platform: Platform;
  id?: string;
  login?: string;
  displayName: string;
  roles: UserRole[];
};

export type ChatMessageEvent = {
  kind: "chat.message";
  id: string;
  ts: number;
  platform: Platform;

  channelId?: string;
  channelName?: string;

  user: ChatUser;
  text: string;

  provider?: Record<string, unknown>;
};

export type AppEvent = ChatMessageEvent;
