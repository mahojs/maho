export type Platform = "twitch"; // Prepared for future
export type UserRole = "broadcaster" | "mod" | "vip" | "sub" | "member";

export type MessagePart =
  | { type: "text"; content: string }
  | { type: "emote"; id: string; name: string } // name is "Kappa"
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
  
  /** Raw text for Rules Engine regex matching */
  text: string;
  
  /** Tokenized text for Frontend rendering (emotes, links) */
  parts: MessagePart[]; 

  provider?: Record<string, unknown>;
};

export type AppEvent = ChatMessageEvent;
