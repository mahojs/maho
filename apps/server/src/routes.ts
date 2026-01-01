import type { ChatMessageEvent } from "@maho/shared";
import { evaluateEvent, type State } from "./state";
import type { WsHub } from "./wsHub";

function html(content: string) {
  return new Response(content, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function handleHttp(
  req: Request,
  state: State,
  hub: WsHub,
  port: number
): Response | undefined {
  const url = new URL(req.url);

  if (url.pathname === "/health") return new Response("ok");

  if (url.pathname === "/dev/state")
    return json({ config: state.config, ruleset: state.ruleset });

  if (url.pathname === "/dev/fake" && req.method === "POST") {
    return (async () => {
      const body = (await req.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const text = String(body.text ?? "pog");
      const platform = "twitch";

      const ev: ChatMessageEvent = {
        kind: "chat.message",
        id: crypto.randomUUID(),
        ts: Date.now(),
        platform,
        channelName: state.config.channel,
        user: {
          platform,
          displayName: "Tester",
          login: "tester",
          roles: [],
        },
        text,
        provider: { devFake: true },
      };

      const payload = evaluateEvent(state, ev);
      hub.broadcast({ op: "event", payload });
      return new Response("sent");
    })() as unknown as Response;
  }

  if (url.pathname === "/overlay") {
    return html(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>maho overlay (dev)</title>
  <style>
    body { margin:0; background: transparent; color: #fff; font-family: system-ui; }
    #wrap { padding: 16px; }
    .msg { margin: 6px 0; padding: 8px 10px; background: rgba(0,0,0,0.55); border-radius: 12px; width: fit-content; }
    .suppressed { opacity: 0.45; text-decoration: line-through; }
  </style>
</head>
<body>
  <div id="wrap">
    <div class="msg">overlay alive ✅</div>
  </div>
  <script>
    const wrap = document.getElementById("wrap");
    const ws = new WebSocket("ws://" + location.host + "/ws");
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ op: "hello", role: "overlay", protocolVersion: 1 }));
    });
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      if (msg.op === "event") {
        const sup = (msg.payload.actions || []).some(a => a.type === "suppress");
        const div = document.createElement("div");
        div.className = "msg" + (sup ? " suppressed" : "");
        div.textContent = msg.payload.event.user.displayName + ": " + msg.payload.event.text;
        wrap.appendChild(div);
      }
      if (msg.op === "error") {
        const div = document.createElement("div");
        div.className = "msg suppressed";
        div.textContent = "ERROR: " + msg.message;
        wrap.appendChild(div);
      }
    });
  </script>
</body>
</html>`);
  }

  if (url.pathname === "/control") {
    return html(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>maho control (dev)</title>
</head>
<body style="font-family:system-ui; padding:16px; max-width: 900px;">
  <h1>maho control (dev)</h1>
  <p>Overlay URL: <code>${"http://localhost:" + port + "/overlay"}</code></p>

  <h2>WS</h2>
  <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
    <label>
      Channel:
      <input id="channel" style="width:220px" value="${state.config.channel}" />
    </label>
    <button id="apply">Apply channel</button>
    <span id="status" style="opacity:0.8;"></span>
  </div>

  <h2>Fake message</h2>
  <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
    <label>Text <input id="text" value="pog" /></label>
    <label>Platform
      <select id="plat">
        <option value="twitch">twitch</option>
        <option value="youtube">youtube</option>
      </select>
    </label>
    <button id="send">Send</button>
  </div>

  <h2>Log</h2>
  <pre id="log" style="background:#111;color:#eee;padding:12px;border-radius:12px;white-space:pre-wrap;"></pre>

  <script>
    const log = document.getElementById("log");
    const statusEl = document.getElementById("status");
    const channelEl = document.getElementById("channel");

    function w(s){ log.textContent = s + "\\n" + log.textContent; }
    function status(s){ statusEl.textContent = s; }

    const ws = new WebSocket("ws://" + location.host + "/ws");

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ op: "hello", role: "control", protocolVersion: 1 }));
      status("ws connected");
    });

    ws.addEventListener("close", () => status("ws closed"));
    ws.addEventListener("error", () => status("ws error"));

    ws.addEventListener("message", (e) => {
      w("ws " + e.data);
      try {
        const msg = JSON.parse(e.data);
        if (msg.op === "state" || msg.op === "config:changed") {
          if (msg.config?.channel) channelEl.value = msg.config.channel;
        }
      } catch {}
    });

    document.getElementById("apply").onclick = () => {
      const next = {
        channel: channelEl.value.trim(),
        maxMessages: ${state.config.maxMessages},
        disappear: ${state.config.disappear},
        lifetimeMs: ${state.config.lifetimeMs},
        fadeMs: ${state.config.fadeMs},
        showNames: ${state.config.showNames},
        hideLinks: ${state.config.hideLinks},
        blocklist: ${JSON.stringify(state.config.blocklist)}
      };

      ws.send(JSON.stringify({ op: "config:set", config: next }));
      status("sent config:set");
    };

    document.getElementById("send").onclick = async () => {
      const text = document.getElementById("text").value;
      const platform = document.getElementById("plat").value;
      await fetch("/dev/fake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, platform })
      });
    };
  </script>
</body>
</html>`);
  }

  return new Response("invalid");
}
