export type Platform = "twitch";
export type UserRole = "broadcaster" | "mod" | "vip" | "sub" | "member";

export type MessagePart =
  | { type: "text"; content: string }
  | { type: "emote"; id: string; name: string; url?: string }
  | { type: "mention"; user: string }
  | { type: "link"; url: string; text: string };

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
  parts: MessagePart[]; 
  provider?: Record<string, unknown>;
};

export type AppEvent = ChatMessageEvent;
