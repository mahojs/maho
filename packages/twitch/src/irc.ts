import type { ChatMessageEvent, MessagePart, UserRole } from "@maho/shared";

const TWITCH_IRC_WS = "wss://irc-ws.chat.twitch.tv:443";

export type TwitchIrcOptions = {
  channel: string; // login name (no #)
  username?: string;
  token?: string;
  onChatMessage: (ev: ChatMessageEvent) => void;
  onStatus?: (s: string) => void;
};

/* U+034F: combining grapheme joiner
   U+200B: zero width space
   U+200C: zero width non-Joiner
   U+200D: zero width joiner
   U+2060: word joiner
   U+FEFF: zero width no-break Space */
const INVISIBLE_MARKERS_REGEX = /[\u034F\u200B-\u200D\u2060\uFEFF]/g;

function sanitizeText(raw: string): string {
  return raw.replace(INVISIBLE_MARKERS_REGEX, "").trim();
}

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

function unwrapCtcpAction(text: string): { text: string; isAction: boolean } {
  if (text.startsWith("\u0001ACTION ") && text.endsWith("\u0001")) {
    return {
      text: text.slice("\u0001ACTION ".length, -1),
      isAction: true,
    };
  }
  return { text, isAction: false };
}

export function connectTwitchIrc(opts: TwitchIrcOptions): {
  close: () => void;
} {
  let ws: WebSocket | null = null;
  let closed = false;

  const channel = opts.channel.replace(/^#/, "").trim();
  if (!channel) throw new Error("channel is required");

  const hasAuth = !!opts.token && !!opts.username;
  const nick = hasAuth ? opts.username! : `justinfan${Math.floor(Math.random() * 100000)}`;

  let pass = "SCHMOOPIIE";
  if (hasAuth) {
    pass = opts.token!.startsWith("oauth: ") ? opts.token! : `oauth:${opts.token}`;
  }

  function log(s: string) {
    opts.onStatus?.(s);
  }

  function start() {
    if (closed) return;

    ws = new WebSocket(TWITCH_IRC_WS);

    ws.addEventListener("open", () => {
      ws?.send(`PASS ${pass}`);
      ws?.send(`NICK ${nick}`);
      ws?.send(
        "CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership"
      );
      ws?.send(`JOIN #${channel}`);

      const authMode = hasAuth ? `authenticated as ${nick}` : "anonymous";
      log(`twitch irc: connected (${authMode}), joined #${channel}`);
    });

    ws.addEventListener("message", (ev) => {
      const data = String(ev.data);
      const lines = data.split("\r\n").filter(Boolean);

      for (const line of lines) {
        if (line.startsWith("PING")) {
          ws?.send("PONG :tmi.twitch.tv");
          continue;
        }

        if (line === ":tmi.twitch.tv NOTICE * :Login authenticateion failed") {
          log("login failed");
          closed = true;
          ws?.close();
          return;
        }

        // PRIVMSG parse, temp
        const m = line.match(/^(?:@([^ ]+)\s)?:(\S+)\sPRIVMSG\s#(\S+)\s:(.*)$/);
        if (!m) continue;

        const tagsPart = m[1];
        const prefix = m[2] ?? "";
        const chan = m[3] ?? channel;
        const rawText = m[4] ?? "";
        const { text: actionText, isAction } = unwrapCtcpAction(rawText);
        const text = sanitizeText(actionText);

        const userLogin = (prefix.split("!")[0] || "unknown").toLowerCase();
        const tags = parseTags(tagsPart);

        const id = tags.get("id") || crypto.randomUUID();
        const displayName = tags.get("display-name") || userLogin;

        const roles = rolesFromTags(tags, chan, userLogin);

        let parts = parseMessageParts(actionText, tags.get("emotes"));
        parts = parts.map((p) => {
          if (p.type === "text") {
            return { ...p, content: sanitizeText(p.content) };
          }
          return p;
        });

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
            badges: [],
          },
          text,
          parts,
          provider: {
            twitch: {
              isAction,
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
      setTimeout(start, 3000);
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
