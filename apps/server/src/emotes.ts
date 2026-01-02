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

type SevenTVFile = {
  name: string;
  format: string;
};

type SevenTVEmote = {
  name: string;
  data: {
    host: {
      url: string;
      files: SevenTVFile[];
    };
  };
};

type SevenTVEmoteSet = {
  id: string;
  emotes: SevenTVEmote[];
};

type SevenTVConnection = {
  platform: string;
  emote_set_id: string;
  emote_set?: {
    id: string;
    emotes?: SevenTVEmote[];
  };
};

type SevenTVUser = {
  id: string;
  username: string;
  connections: SevenTVConnection[];
};

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

export async function loadEmotes(config: {
  seventvUserId?: string;
}): Promise<EmoteMap> {
  const map: EmoteMap = new Map();

  const globalData = await fetchJson<SevenTVEmoteSet>(
    `${SEVENTV_API}/emote-sets/global`
  );
  if (globalData?.emotes) {
    extract7TVEmotes(globalData.emotes, map);
    console.log(`[emotes] loaded ${globalData.emotes.length} global emotes`);
  }

  if (config.seventvUserId) {
    const url = `${SEVENTV_API}/users/${encodeURIComponent(config.seventvUserId)}`;
    const user = await fetchJson<SevenTVUser>(url);

    if (user && user.connections) {
      const conn = user.connections.find((c) => c.platform === "TWITCH");

      if (conn) {
        if (conn.emote_set?.emotes) {
          extract7TVEmotes(conn.emote_set.emotes, map);
          console.log(
            `[emotes] loaded ${conn.emote_set.emotes.length} channel emotes (embedded)`
          );
        } else if (conn.emote_set_id) {
          const setData = await fetchJson<SevenTVEmoteSet>(
            `${SEVENTV_API}/emote-sets/${conn.emote_set_id}`
          );
          if (setData?.emotes) {
            extract7TVEmotes(setData.emotes, map);
            console.log(
              `[emotes] loaded ${setData.emotes.length} channel emotes (fetched set)`
            );
          }
        }
      } else {
        console.warn(
          `[emotes] user ${config.seventvUserId} has no TWITCH connection`
        );
      }
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
