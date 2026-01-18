import { z } from "zod";

export const PlatformSchema = z.enum(["twitch"]);
export type Platform = z.infer<typeof PlatformSchema>;

export const UserRoleSchema = z.enum([
  "broadcaster",
  "mod",
  "vip",
  "sub",
  "founder",
  "member",
]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserBadgeSchema = z.object({
  setId: z.string(),
  version: z.string(),
  url: z.string(),
  title: z.string(),
});
export type UserBadge = z.infer<typeof UserBadgeSchema>;

export const MessagePartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), content: z.string() }),
  z.object({
    type: z.literal("emote"),
    id: z.string(),
    name: z.string(),
    url: z.string().optional(),
  }),
  z.object({ type: z.literal("mention"), user: z.string() }),
  z.object({ type: z.literal("link"), url: z.string(), text: z.string() }),
]);
export type MessagePart = z.infer<typeof MessagePartSchema>;

// shared user structure for all events
export const ChatUserSchema = z.object({
  platform: PlatformSchema,
  id: z.string().min(1).optional(),
  login: z.string().min(1).optional(),
  displayName: z.string().min(1),
  roles: z
    .array(UserRoleSchema)
    .default([])
    .transform((arr) => [...new Set(arr)]),
  badges: z.array(UserBadgeSchema).default([]),
});
export type ChatUser = z.infer<typeof ChatUserSchema>;

// events

export const ChatMessageEventSchema = z.object({
  kind: z.literal("chat.message"),
  id: z.string().min(1),
  ts: z.number().int().nonnegative(),
  platform: PlatformSchema,
  channelId: z.string().min(1).optional(),
  channelName: z.string().min(1).optional(),
  user: ChatUserSchema,
  text: z.string(),
  parts: z.array(MessagePartSchema).default([]),
  provider: z.unknown().optional(),
});
export type ChatMessageEvent = z.infer<typeof ChatMessageEventSchema>;

export const TwitchFollowEventSchema = z.object({
  kind: z.literal("twitch.follow"),
  id: z.string(),
  ts: z.number(),
  user: ChatUserSchema,
});
export type TwitchFollowEvent = z.infer<typeof TwitchFollowEventSchema>;

export const TwitchSubEventSchema = z.object({
  kind: z.literal("twitch.sub"),
  id: z.string(),
  ts: z.number(),
  user: ChatUserSchema,
  tier: z.string(), // "1000", "2000", "3000", "Prime"
  isGift: z.boolean(),
  months: z.number().default(1),
  streak: z.number().optional(),
  message: z.string().optional(),
});
export type TwitchSubEventSchema = z.infer<typeof TwitchSubEventSchema>;

export const TwitchRaidEventSchema = z.object({
  kind: z.literal("twitch.raid"),
  id: z.string(),
  ts: z.number(),
  user: ChatUserSchema, // raider
  viewers: z.number(),
});
export type TwitchRaidEvent = z.infer<typeof TwitchRaidEventSchema>;

export const TwitchCheerEventSchema = z.object({
  kind: z.literal("twitch.cheer"),
  id: z.string(),
  ts: z.number(),
  user: ChatUserSchema,
  bits: z.number(),
  message: z.string().optional(),
});
export type TwitchCheerEvent = z.infer<typeof TwitchCheerEventSchema>;

// union

export const AppEventSchema = z.discriminatedUnion("kind", [
  ChatMessageEventSchema,
  TwitchFollowEventSchema,
  TwitchSubEventSchema,
  TwitchRaidEventSchema,
  TwitchCheerEventSchema,
]);
export type AppEvent = z.infer<typeof AppEventSchema>;
