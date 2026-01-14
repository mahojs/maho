const IVR_API = "https://api.ivr.fi/v2/twitch/badges";

type IVRBadgeVersion = {
  id: string;
  image_url_1x: string;
  image_url_2x: string;
  image_url_4x: string;
  title: string;
  description: string;
};

type IVRBadgeSet = {
  set_id: string;
  versions: IVRBadgeVersion[];
};

export type BadgeMap = Map<string, Map<string, IVRBadgeVersion>>;

async function fetchBadgeSet(url: string): Promise<BadgeMap> {
  const map: BadgeMap = new Map();
  try {
    const res = await fetch(url);
    if (!res.ok) return map;
    const data = (await res.json()) as IVRBadgeSet[];

    for (const set of data) {
      const versionMap = new Map<string, IVRBadgeVersion>();
      for (const v of set.versions) {
        versionMap.set(v.id, v);
      }
      map.set(set.set_id, versionMap);
    }
  } catch (e) {
    console.error(`[badges] failed to fetch ${url}`, e);
  }
  return map;
}

export async function loadBadges(channelName: string) {
  if (!channelName || channelName === "test") {
    const globalSet = await fetchBadgeSet(`${IVR_API}/global`);
    return { globalSet, channelSet: new Map() as BadgeMap };
  }

  console.log(`[badges] loading global and channel (${channelName})...`);
  const [globalSet, channelSet] = await Promise.all([
    fetchBadgeSet(`${IVR_API}/global`),
    fetchBadgeSet(`${IVR_API}/channel/${channelName}`),
  ]);

  console.log(
    `[badges] loaded sets. Global: ${globalSet.size}, Channel: ${channelSet.size}`
  );
  return { globalSet, channelSet };
}

export function resolveBadges(
  rawTag: string | undefined,
  globalSet: BadgeMap,
  channelSet: BadgeMap
) {
  if (!rawTag) return [];

  const resolved: {
    setId: string;
    version: string;
    url: string;
    title: string;
  }[] = [];
  const parts = rawTag.split(",");

  for (const part of parts) {
    const [setId, version] = part.split("/");
    if (!setId || !version) continue;

    // channel-specific badges override global defaults
    let badge = channelSet.get(setId)?.get(version);
    if (!badge) {
      badge = globalSet.get(setId)?.get(version);
    }

    if (badge) {
      resolved.push({
        setId,
        version,
        url: badge.image_url_2x || badge.image_url_1x,
        title: badge.title,
      });
    }
  }

  return resolved;
}
