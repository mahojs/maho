const HELIX_API = "https://api.twitch.tv/helix";
const ID_API = "https://id.twitch.tv/oauth2";

export type TwitchTokenInfo = {
  clientId: string;
  login: string;
  userId: string;
  expiresIn: number;
  scopes: string[];
};

export type TwitchSubscription = {
  id: string;
  status: string;
  type: string;
  condition: Record<string, string>;
  transport: {
    method: "websocket";
    session_id: string;
  };
};

// validates oauth token and returns identity info for client + broadcaster ID
export async function validateToken(token: string): Promise<TwitchTokenInfo> {
  // strip "oauth:" prefix if present
  const cleanToken = token.startsWith("oauth:") ? token.slice(6) : token;

  const res = await fetch(`${ID_API}/validate`, {
    headers: { Authorization: `OAuth ${cleanToken}` },
  });

  if (!res.ok) {
    throw new Error(`Token validation failed: ${res.status}`);
  }

  const data = (await res.json()) as any;
  return {
    clientId: data.client_id,
    login: data.login,
    userId: data.user_id,
    expiresIn: data.expires_in,
    scopes: data.scopes || [],
  };
}

// helix API call helper
async function helix(
  endpoint: string,
  token: string,
  clientId: string,
  opts: RequestInit = {}
) {
  const cleanToken = token.startsWith("oauth:") ? token.slice(6) : token;

  const res = await fetch(`${HELIX_API}${endpoint}`, {
    ...opts,
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${cleanToken}`,
      "Content-Type": "application/json",
      ...opts.headers,
    },
  });

  if (res.status === 401) throw new Error("Unauthorized (401)");
  if (res.status === 403) throw new Error("Forbidden (403)");
  if (res.status === 204) return null;

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Twitch API Error ${res.status}: ${body}`);
  }

  return await res.json();
}

// create EventSub subscription for ws session
export async function createSubscription(
  token: string,
  clientId: string,
  sessionId: string,
  type: string,
  version: string,
  condition: Record<string, string>
): Promise<TwitchSubscription | null> {
  try {
    const body = {
      type,
      version,
      condition,
      transport: {
        method: "websocket",
        session_id: sessionId,
      },
    };

    const data = (await helix("/eventsub/subscriptions", token, clientId, {
      method: "POST",
      body: JSON.stringify(body),
    })) as any;

    if (data && data.data && data.data[0]) {
      return data.data[0] as TwitchSubscription;
    }
    return null;
  } catch (e: any) {
    console.error(`[twitch] failed to subscribe to ${type}: ${e.message}`);
    return null;
  }
}

export async function getTwitchUserByName(login: string) {
  try {
    const res = await fetch(
      `https://api.ivr.fi/v2/twitch/user?login=${encodeURIComponent(login)}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const user = data[0];
    if (!user) return null;
    return {
      id: user.id,
      login: user.login,
      displayName: user.displayName,
      logo: user.logo,
    };
  } catch (e) {
    console.error(`[twitch] public id lookup failed for ${login}:`, e);
    return null;
  }
}
