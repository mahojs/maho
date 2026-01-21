import type {
  AppEvent,
  TwitchFollowEvent,
  TwitchSubEvent,
  TwitchRaidEvent,
  TwitchCheerEvent,
  UserRole,
} from "@maho/shared";
import { sanitizeText } from "@maho/shared";
import { createSubscription, type TwitchTokenInfo } from "./api";

const EVENTSUB_WS = "wss://eventsub.wss.twitch.tv/ws";

export type EventSubOptions = {
  token: string;
  identity: TwitchTokenInfo;
  onEvent: (ev: AppEvent) => void;
  onStatus?: (msg: string) => void;
  onError?: (err: Error) => void;
};

type SessionWelcome = {
  metadata: { message_type: "session_welcome" };
  payload: {
    session: {
      id: string;
      keepalive_timeout_seconds: number;
    };
  };
};

type Notification = {
  metadata: { message_type: "notification"; message_timestamp: string };
  payload: {
    subscription: { type: string; version: string };
    event: Record<string, any>;
  };
};

type KeepAlive = {
  metadata: { message_type: "session_keepalive" };
};

export function connectEventSub(opts: EventSubOptions) {
  let ws: WebSocket | null = null;
  let reconnectUrl: string | null = null;
  let keepAliveTimer: ReturnType<typeof setTimeout> | null = null;
  let keepAliveSeconds = 10; // default; updated by welcome
  let closed = false;

  function log(s: string) {
    opts.onStatus?.(`[eventsub] ${s}`);
  }

  function resetWatchdog() {
    if (keepAliveTimer) clearTimeout(keepAliveTimer);
    // small timeout buffer
    keepAliveTimer = setTimeout(
      () => {
        log("keepalive timeout, reconnecting...");
        ws?.close();
      },
      (keepAliveSeconds + 2) * 1000
    );
  }

  async function registerSubscriptions(sessionId: string) {
    const { token, identity } = opts;
    const broadcasterId = identity.userId;
    const clientId = identity.clientId;

    log(`registering subs for session ${sessionId.slice(0, 8)}...`);

    const subs: {
      type: string;
      version: string;
      condition: Record<string, string>;
    }[] = [
      {
        type: "channel.follow",
        version: "2",
        condition: {
          broadcaster_user_id: broadcasterId,
          moderator_user_id: broadcasterId,
        },
      },
      {
        type: "channel.subscribe",
        version: "1",
        condition: { broadcaster_user_id: broadcasterId },
      },
      {
        type: "channel.subscription.message",
        version: "1",
        condition: { broadcaster_user_id: broadcasterId },
      },
      {
        type: "channel.raid",
        version: "1",
        condition: { to_broadcaster_user_id: broadcasterId },
      },
      {
        type: "channel.cheer",
        version: "1",
        condition: { broadcaster_user_id: broadcasterId },
      },
    ];

    for (const s of subs) {
      await createSubscription(
        token,
        clientId,
        sessionId,
        s.type,
        s.version,
        s.condition
      );
    }
    log("subscriptions registered");
  }

  function handleNotification(msg: Notification) {
    const type = msg.payload.subscription.type;
    const data = msg.payload.event;
    const ts = new Date(msg.metadata.message_timestamp).getTime();
    const id = crypto.randomUUID();

    // mapping helpers
    const baseUser = (displayName: string, login: string, uid?: string) => ({
      platform: "twitch" as const,
      displayName,
      login,
      id: uid,
      roles: ["member" as UserRole],
      badges: [],
    });

    try {
      if (type === "channel.follow") {
        const ev: TwitchFollowEvent = {
          kind: "twitch.follow",
          id,
          ts,
          user: baseUser(data.user_name, data.user_login, data.user_id),
        };
        opts.onEvent(ev);
        return;
      }

      if (
        type === "channel.subscribe" ||
        type === "channel.subscription.message"
      ) {
        const isResub = type === "channel.subscription.message";
        const ev: TwitchSubEvent = {
          kind: "twitch.sub",
          id,
          ts,
          user: baseUser(data.user_name, data.user_login, data.user_id),
          tier: data.tier,
          isGift: isResub ? false : (data.is_gift ?? false),
          months: isResub ? (data.cumulative_months ?? 1) : 1,
          streak: isResub ? (data.streak_months ?? undefined) : undefined,
          message: isResub ? (data.message?.text ? sanitizeText(data.message.text) : undefined) : undefined,
        };
        opts.onEvent(ev);
        return;
      }

      if (type === "channel.raid") {
        const ev: TwitchRaidEvent = {
          kind: "twitch.raid",
          id,
          ts,
          user: baseUser(
            data.from_broadcaster_user_name,
            data.from_broadcaster_user_login,
            data.from_broadcaster_user_id
          ),
          viewers: data.viewers,
        };
        opts.onEvent(ev);
        return;
      }

      if (type === "channel.cheer") {
        const ev: TwitchCheerEvent = {
          kind: "twitch.cheer",
          id,
          ts,
          user: data.is_anonymous
            ? baseUser("Anonymous", "anonymous")
            : baseUser(data.user_name, data.user_login, data.user_id),
          bits: data.bits,
          message: data.message ? sanitizeText(data.message) : undefined,
        };
        opts.onEvent(ev);
        return;
      }
    } catch (e) {
      console.error("failed to normalize event", e, msg);
    }
  }

  function connect() {
    if (closed) return;

    // use reconnectUrl if provided by twitch
    const url = reconnectUrl || EVENTSUB_WS;
    ws = new WebSocket(url);

    // reset after use
    reconnectUrl = null;

    ws.addEventListener("open", () => {
      log("connected");
    });

    ws.addEventListener("message", (e) => {
      const raw = String(e.data);
      let data: any;
      try {
        data = JSON.parse(raw);
      } catch {
        return;
      }

      const type = data.metadata?.message_type;

      if (type === "session_welcome") {
        const welcome = data as SessionWelcome;
        keepAliveSeconds = welcome.payload.session.keepalive_timeout_seconds;
        resetWatchdog();
        registerSubscriptions(welcome.payload.session.id).catch((err) => {
          log(`sub error: ${err.message}`);
          opts.onError?.(err);
        });
        return;
      }

      if (type === "session_keepalive") {
        resetWatchdog();
        return;
      }

      if (type === "notification") {
        resetWatchdog();
        handleNotification(data as Notification);
        return;
      }

      if (type === "session_reconnect") {
        reconnectUrl = data.payload.session.reconnect_url;
        log("Twitch requested migration, reconnecting to provided URL...");
        ws?.close(); // trigger close listener and call connect() again
        return;
      }
    });

    ws.addEventListener("close", () => {
      if (keepAliveTimer) clearTimeout(keepAliveTimer);
      if (closed) return;
      log("disconnected");
      setTimeout(connect, 2000);
    });

    ws.addEventListener("error", () => {
      log("error");
      ws?.close();
    });
  }

  connect();

  return {
    close: () => {
      closed = true;
      if (keepAliveTimer) clearTimeout(keepAliveTimer);
      ws?.close();
    },
  };
}
