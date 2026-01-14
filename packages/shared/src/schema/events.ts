import { z } from "zod";

export const PlatformSchema = z.enum(["twitch"]);
export const UserRoleSchema = z.enum([
  "broadcaster",
  "mod",
  "vip",
  "sub",
  "member",
]);

export const UserBadgeSchema = z.object({
  setId: z.string(),
  version: z.string(),
  url: z.string(),
  title: z.string(),
});

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

export const AppEventSchema = z.discriminatedUnion("kind", [
  ChatMessageEventSchema,
]);
