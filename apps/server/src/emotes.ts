import type { MessagePart } from "@maho/shared";

const SEVENTV_API = "https://api.7tv.app/v3";

export type EmoteMap = Map<string, string>;

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
    return (await res.json()) as T;
  } catch (e) {
    console.error(`[emotes] failed to fetch ${url}:`, e);
    return null;
  }
}

type SevenTVEmote = {
  name: string;
  data: {
    host: { url: string; files: { name: string; format: string }[] };
  };
};

type SevenTVSet = { emotes: SevenTVEmote[] };
type SevenTVUser = { emote_set?: { id: string }; username: string };

function extract7TVEmotes(emotes: SevenTVEmote[], map: EmoteMap) {
  for (const e of emotes) {
    const host = e.data.host;
    if (!host.files || !host.files.length) continue;
    const file =
      host.files.find((f) => f.format === "WEBP" && f.name === "2x.webp") ||
      host.files.find((f) => f.format === "WEBP") ||
      host.files[0];

    if (!file) continue;
    const baseUrl = host.url.startsWith("//") ? `https:${host.url}` : host.url;
    map.set(e.name, `${baseUrl}/${file.name}`);
  }
}

async function resolveUserSetId(userId: string): Promise<string | null> {
  const user = await fetchJson<SevenTVUser>(`${SEVENTV_API}/users/${userId}`);
  if (user?.emote_set?.id) return user.emote_set.id;
  return null;
}

export async function loadEmotes(config: {
  seventvUserId?: string;
}): Promise<EmoteMap> {
  const map: EmoteMap = new Map();

  const globalData = await fetchJson<SevenTVSet>(
    `${SEVENTV_API}/emote-sets/global`
  );
  if (globalData?.emotes) {
    extract7TVEmotes(globalData.emotes, map);
    console.log(`[emotes] loaded ${globalData.emotes.length} global emotes`);
  }

  if (config.seventvUserId) {
    const setId = await resolveUserSetId(config.seventvUserId);
    if (setId) {
      const setData = await fetchJson<SevenTVSet>(
        `${SEVENTV_API}/emote-sets/${setId}`
      );
      if (setData?.emotes) {
        extract7TVEmotes(setData.emotes, map);
        console.log(
          `[emotes] loaded ${setData.emotes.length} emotes for user ${config.seventvUserId} (set: ${setId})`
        );
      }
    } else {
      console.warn(
        `[emotes] could not resolve emote set for 7TV user ${config.seventvUserId}`
      );
    }
  }

  return map;
}

export function enrichMessageParts(
  parts: MessagePart[],
  map: EmoteMap
): MessagePart[] {
  if (map.size === 0) return parts;

  const out: MessagePart[] = [];

  for (const part of parts) {
    if (part.type !== "text") {
      out.push(part);
      continue;
    }

    const tokens = part.content.split(/(\s+)/);

    for (const token of tokens) {
      if (!token) continue;

      const url = map.get(token);
      if (url && token.trim().length > 0) {
        out.push({
          type: "emote",
          id: "7tv-" + token,
          name: token,
          url: url,
        });
      } else {
        out.push({ type: "text", content: token });
      }
    }
  }

  return out;
}
