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
  id: string;
  name: string;
  data: {
    host: {
      url: string;
      files: { name: string; format: string }[];
    };
  };
};

type SevenTVEmoteSet = {
  id: string;
  emotes: SevenTVEmote[];
};

type SevenTVTwitchLookupResponse = {
  id: string;
  username: string;
  emote_set?: SevenTVEmoteSet;
};

function extract7TVEmotes(emotes: SevenTVEmote[], map: EmoteMap) {
  for (const e of emotes) {
    const host = e.data?.host;
    if (!host || !host.files || !host.files.length) continue;

    const file =
      host.files.find((f) => f.format === "WEBP" && f.name === "2x.webp") ||
      host.files.find((f) => f.format === "WEBP") ||
      host.files[0];

    if (!file) continue;

    const baseUrl = host.url.startsWith("//") ? `https:${host.url}` : host.url;
    map.set(e.name, `${baseUrl}/${file.name}`);
  }
}

export async function loadEmotes(twitchUserId?: string): Promise<EmoteMap> {
  const map: EmoteMap = new Map();

  const globalData = await fetchJson<SevenTVEmoteSet>(
    `${SEVENTV_API}/emote-sets/global`
  );
  if (globalData?.emotes) {
    extract7TVEmotes(globalData.emotes, map);
    console.log(`[emotes] loaded ${globalData.emotes.length} global emotes`);
  }

  if (twitchUserId) {
    const url = `${SEVENTV_API}/users/twitch/${twitchUserId}`;
    const user = await fetchJson<SevenTVTwitchLookupResponse>(url);

    if (user && user.emote_set?.emotes) {
      extract7TVEmotes(user.emote_set.emotes, map);
      console.log(
        `[emotes] loaded ${user.emote_set.emotes.length} channel emotes for ${user.username}`
      );
    } else {
      console.warn(`[emotes] no emote set found for twitch ID ${twitchUserId}`);
    }
  }

  console.log(`[emotes] total map size: ${map.size}`);
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

      if (/^\s+$/.test(token)) {
        out.push({ type: "text", content: token });
        continue;
      }

      const url = map.get(token);
      if (url) {
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
