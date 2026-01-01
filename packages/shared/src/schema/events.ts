import { z } from "zod";

export const PlatformSchema = z.enum(["twitch"]);
export const UserRoleSchema = z.enum([
  "broadcaster",
  "mod",
  "vip",
  "sub",
  "member",
]);
export const ChatUserSchema = z.object({
  platform: PlatformSchema,
  id: z.string().min(1).optional,
  login: z.string().min(1).optional,
  displayName: z.string().min(1),
  roles: z
    .array(UserRoleSchema)
    .default([])
    .transform((arr) => [...new Set(arr)]),
});

export const ChatMessageEventSchema = z.object({
  kind: z.literal("chat.message"),
  id: z.string().min(1),
  ts: z.number().int().nonnegative(),
  platform: PlatformSchema,
  channelId: z.string().min(1).optional,
  channelName: z.string().min(1).optional,
  user: UserRoleSchema,
  text: z.string(),
  provider: z.unknown().optional(),
});

export const AppEventSchema = z.discriminatedUnion("kind", [
  ChatMessageEventSchema,
]);
