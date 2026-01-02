import type { ChatMessageEvent, MessagePart, UserRole } from "@maho/shared";

const TWITCH_IRC_WS = "wss://irc-ws.chat.twitch.tv:443";

export type TwitchIrcOptions = {
  channel: string; // login name (no #)
  onChatMessage: (ev: ChatMessageEvent) => void;
  onStatus?: (s: string) => void;
};

function parseTags(tagsPart: string | undefined): Map<string, string> {
  const tags = new Map<string, string>();
  if (!tagsPart) return tags;
  for (const kv of tagsPart.split(";")) {
    const i = kv.indexOf("=");
    const k = i === -1 ? kv : kv.slice(0, i);
    const v = i === -1 ? "" : kv.slice(i + 1);
    tags.set(k, v);
  }
  return tags;
}

function rolesFromTags(
  tags: Map<string, string>,
  channelLogin: string,
  userLogin: string
): UserRole[] {
  const roles: UserRole[] = [];

  if (userLogin.toLowerCase() === channelLogin.toLowerCase())
    roles.push("broadcaster");
  if (tags.get("mod") === "1") roles.push("mod");

  const badges = tags.get("badges") ?? "";
  if (badges.split(",").some((b) => b.startsWith("vip/"))) roles.push("vip");
  if (badges.split(",").some((b) => b.startsWith("subscriber/")))
    roles.push("sub");
  return [...new Set(roles)];
}

function parseMessageParts(
  text: string,
  emotesTag: string | undefined
): MessagePart[] {
  if (!emotesTag) {
    return [{ type: "text", content: text }];
  }

  type EmoteRange = { id: string; start: number; end: number };
  const ranges: EmoteRange[] = [];

  const groups = emotesTag.split("/");
  for (const group of groups) {
    const [id, positions] = group.split(":");
    if (!id || !positions) continue;

    for (const pos of positions.split(",")) {
      const [start, end] = pos.split("-");
      ranges.push({ id, start: Number(start), end: Number(end) });
    }
  }

  ranges.sort((a, b) => a.start - b.start);

  const parts: MessagePart[] = [];
  let cursor = 0;

  for (const r of ranges) {
    if (r.start > cursor) {
      parts.push({
        type: "text",
        content: text.substring(cursor, r.start),
      });
    }

    const name = text.substring(r.start, r.end + 1);
    parts.push({
      type: "emote",
      id: r.id,
      name,
    });

    cursor = r.end + 1;
  }

  if (cursor < text.length) {
    parts.push({
      type: "text",
      content: text.substring(cursor),
    });
  }

  return parts;
}

export function connectTwitchIrc(opts: TwitchIrcOptions): {
  close: () => void;
} {
  let ws: WebSocket | null = null;
  let closed = false;

  const channel = opts.channel.replace(/^#/, "").trim();
  if (!channel) throw new Error("channel is required");

  function log(s: string) {
    opts.onStatus?.(s);
  }

  function start() {
    if (closed) return;

    ws = new WebSocket(TWITCH_IRC_WS);

    ws.addEventListener("open", () => {
      ws?.send("PASS SCHMOOPIIE");
      ws?.send(`NICK justinfan${Math.floor(Math.random() * 100000)}`);
      ws?.send(
        "CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership"
      );
      ws?.send(`JOIN #${channel}`);
      log(`twitch irc: connected, joined #${channel}`);
    });

    ws.addEventListener("message", (ev) => {
      const data = String(ev.data);
      const lines = data.split("\r\n").filter(Boolean);

      for (const line of lines) {
        if (line.startsWith("PING")) {
          ws?.send("PONG :tmi.twitch.tv");
          continue;
        }

        // PRIVMSG parse, temp
        const m = line.match(/^(?:@([^ ]+)\s)?:(\S+)\sPRIVMSG\s#(\S+)\s:(.*)$/);
        if (!m) continue;

        const tagsPart = m[1];
        const prefix = m[2] ?? "";
        const chan = m[3] ?? channel;
        const text = m[4] ?? "";

        const userLogin = (prefix.split("!")[0] || "unknown").toLowerCase();
        const tags = parseTags(tagsPart);

        const id = tags.get("id") || crypto.randomUUID();
        const displayName = tags.get("display-name") || userLogin;

        const roles = rolesFromTags(tags, chan, userLogin);
        const parts = parseMessageParts(text, tags.get("emotes"));

        const msgEvent: ChatMessageEvent = {
          kind: "chat.message",
          id,
          ts: Date.now(),
          platform: "twitch",
          channelName: chan,
          user: {
            platform: "twitch",
            id: tags.get("user-id") || undefined,
            login: userLogin,
            displayName,
            roles,
          },
          text,
          parts,
          provider: {
            twitch: {
              tags: Object.fromEntries(tags.entries()),
              raw: line,
            },
          },
        };

        opts.onChatMessage(msgEvent);
      }
    });

    ws.addEventListener("close", () => {
      if (closed) return;
      log("twitch irc: disconnected, reconnecting…");
      setTimeout(start, 1000);
    });

    ws.addEventListener("error", () => {
      log("twitch irc: error");
      ws?.close();
    });
  }

  start();

  return {
    close() {
      closed = true;
      ws?.close();
      ws = null;
    },
  };
}
