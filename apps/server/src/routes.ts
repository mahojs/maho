import type {
  AppEvent,
  ChatMessageEvent,
  TwitchFollowEvent,
  TwitchSubEventSchema,
  TwitchRaidEvent,
  MessagePart,
  UserRole,
} from "@maho/shared";
import { evaluateEvent, type State } from "./state";
import type { WsHub } from "./wsHub";
import { appendEvent } from "./commands";
import path from "node:path";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const PUBLIC_DIR = path.resolve(process.cwd(), "public");
const CONTROL_DIR = path.join(PUBLIC_DIR, "control");

export async function handleHttp(
  req: Request,
  state: State,
  hub: WsHub,
  port: number
): Promise<Response | undefined> {
  const url = new URL(req.url);

  if (url.pathname === "/overlay") {
    return new Response(Bun.file(path.join(PUBLIC_DIR, "overlay.html")));
  }

  if (
    url.pathname === "/control" ||
    url.pathname === "/control/" ||
    url.pathname === "/control/index.html"
  ) {
    const file = Bun.file(path.join(CONTROL_DIR, "index.html"));
    let html = await file.text();

    // inject key
    const script = `<script>window.MAHO_API_KEY = "${state.config.apiKey}";</script>`;
    html = html.replace("</head>", `${script}</head>`);

    return new Response(html, {
      headers: { "content-type": "text/html" },
    });
  }

  if (url.pathname.startsWith("/control/")) {
    const rel = url.pathname.slice("/control/".length); // no leading slash
    const filePath = path.join(CONTROL_DIR, rel);

    return new Response(Bun.file(filePath));
  }

  if (url.pathname === "/debug") {
    return new Response(Bun.file(path.join(PUBLIC_DIR, "control.html")), {
      headers: { "content-type": "text/html" },
    });
  }

  if (url.pathname === "/health") return new Response("ok");

  if (url.pathname === "/dev/state")
    return json({ config: state.config, ruleset: state.ruleset });

  if (url.pathname === "/dev/fake" && req.method === "POST") {
    return (async () => {
      const body = (await req.json().catch(() => ({}))) as any;
      const kind = body.kind || "chat.message";
      const text = String(body.text ?? "simulation test");
      const platform = "twitch";
      const id = crypto.randomUUID();
      const ts = Date.now();

      const baseUser = {
        platform: "twitch" as const,
        displayName: "TestUser",
        login: "testuser",
        roles: ["member" as UserRole],
        badges: [],
      };

      let ev: AppEvent;

      if (kind === "twitch.follow") {
        ev = {
          kind: "twitch.follow",
          id,
          ts,
          user: baseUser,
        } as TwitchFollowEvent;
      } else if (kind === "twitch.sub") {
        ev = {
          kind: "twitch.sub",
          id,
          ts,
          user: baseUser,
          tier: "1000",
          isGift: false,
          months: 1,
        } as TwitchSubEventSchema;
      } else if (kind === "twitch.raid") {
        ev = {
          kind: "twitch.raid",
          id,
          ts,
          user: baseUser,
          viewers: Math.floor(Math.random() * 100) + 1,
        } as TwitchRaidEvent;
      } else {
        const parts: MessagePart[] = [{ type: "text", content: text }];
        ev = {
          kind: "chat.message",
          id,
          ts,
          platform,
          channelName: state.config.channel,
          user: baseUser,
          text,
          parts,
          provider: { devFake: true },
        } as ChatMessageEvent;
      }

      const payload = evaluateEvent(state, ev);
      const entry = appendEvent(state, payload);
      hub.broadcast({
        op: "event",
        seq: entry.seq,
        payload: entry.payload,
      });

      return new Response("sent");
    })() as unknown as Response;
  }

  return undefined;
}
