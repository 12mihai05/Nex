import { z } from "zod";
import { getConfig } from "../../config.js";
import { decodeXmlTv, downloadPublic } from "./download.js";
import type { EpgProvider } from "./provider.js";
import { parseXmlTv, type ParsedXmlTv } from "./xmltv.js";

const channelSchema = z.object({ id: z.string(), name: z.string(), country: z.string(), is_nsfw: z.boolean().optional() });
const guideSchema = z.object({ channel: z.string().nullable(), feed: z.string().nullable().optional(), site: z.string(), site_id: z.string(), lang: z.string(), sources: z.array(z.object({ url: z.string().url() })) });
const feedSchema = z.object({ channel: z.string(), id: z.string(), broadcast_area: z.array(z.string()) });
export type DirectoryChannel = z.infer<typeof channelSchema>;
export type DirectoryGuide = z.infer<typeof guideSchema>;

let cached: { expires: number; channels: DirectoryChannel[]; guides: DirectoryGuide[]; feeds: z.infer<typeof feedSchema>[] } | undefined;
export async function getDirectory() {
  if (cached && cached.expires > Date.now()) return cached;
  const base = getConfig().IPTV_ORG_API_BASE.replace(/\/$/, "");
  const json = async (name: string) => JSON.parse(Buffer.from(await downloadPublic(`${base}/${name}.json`)).toString("utf8")) as unknown;
  const [channels, guides, feeds] = await Promise.all([json("channels"), json("guides"), json("feeds")]);
  cached = { expires: Date.now() + 86_400_000, channels: z.array(channelSchema).parse(channels), guides: z.array(guideSchema).parse(guides), feeds: z.array(feedSchema).parse(feeds) };
  return cached;
}

export function selectCountryChannels(channels: DirectoryChannel[], country: string, broadcastIds = new Set<string>()) {
  return channels.filter((c) => !c.is_nsfw && (c.country === country || broadcastIds.has(c.id)));
}

export function epgShareCountryFiles(indexHtml: string, country: string): string[] {
  const prefix=country === "GB" ? "UK" : country;
  if (!/^[A-Z]{2}$/.test(prefix)) return [];
  const names=[...indexHtml.matchAll(/href="(epg_ripper_([A-Z]{2})(\d+)\.xml\.gz)"/g)].filter((m)=>m[2]===prefix).sort((a,b)=>Number(a[3])-Number(b[3]));
  return [...new Set(names.map((m)=>`https://epgshare01.online/epgshare01/${m[1]}`))];
}

// Empty/stale directory entries must not consume the schedule import budget.
export function scheduledChannelIds(programs: Iterable<ParsedXmlTv['programs'][number]>, now=Date.now(), futureDays=14) {
  return new Set([...programs].filter(p=>+p.endAt>now&&+p.startAt<=now+futureDays*86_400_000).map(p=>p.channelExternalId));
}

export class IptvOrgProvider implements EpgProvider {
  readonly sourceId: string;
  constructor(readonly country: string) { this.sourceId = `iptv-org:${country}`; }
  async load(options?:{preferredExternalIds:Set<string>}): Promise<ParsedXmlTv> {
    const overrides = z.record(z.string(), z.array(z.string().url())).parse(JSON.parse(getConfig().EPG_COUNTRY_SOURCES_JSON));
    // Explicit country feeds remain usable if the metadata directory is down.
    const directory = await getDirectory().catch((error: unknown) => {
      if (overrides[this.country]?.length) return { channels: [], guides: [], feeds: [] };
      throw error;
    });
    const broadcastIds = new Set(directory.feeds.filter((f) => f.broadcast_area.includes(`c/${this.country}`)).map((f) => f.channel));
    const metadata = selectCountryChannels(directory.channels, this.country, broadcastIds);
    const ids = new Set(metadata.map((c) => c.id));
    const guides = directory.guides.filter((g) => g.channel && ids.has(g.channel));
    let urls = [...new Set(overrides[this.country] ?? guides.flatMap((g) => g.sources.map((s) => s.url)))];
    let countryFeed=Boolean(overrides[this.country]);
    if (!urls.length) {
      const index=Buffer.from(await downloadPublic("https://epgshare01.online/epgshare01/")).toString("utf8");
      urls=epgShareCountryFiles(index,this.country);
      countryFeed=true;
      // The shared Romanian guide contains a small verified Moldova subset.
      // Filter it strictly through Moldova directory/broadcast metadata, never
      // relabel the complete Romanian feed as Moldova.
      if(!urls.length && this.country === "MD") {
        urls=epgShareCountryFiles(index,"RO");
        countryFeed=false;
      }
    }
    if (!urls.length) throw new Error("EPG_NO_HOSTED_GUIDES");
    // Fail visibly instead of silently presenting a truncated source as complete.
    if (urls.length>getConfig().EPG_MAX_FEEDS_PER_COUNTRY) throw new Error('EPG_FEED_CAPACITY');
    const results = await Promise.allSettled(urls.map(async (url) => parseXmlTv(decodeXmlTv(await downloadPublic(url)))));
    const successful = results.filter((r): r is PromiseFulfilledResult<ParsedXmlTv> => r.status === "fulfilled");
    // Preserve the last complete schedule on partial feed failure.
    if (successful.length !== urls.length) throw new Error("EPG_FEED_UNAVAILABLE");
    const byId = new Map(metadata.map((c) => [c.id.toLowerCase(), c]));
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const byName = new Map(metadata.map((c) => [normalize(c.name), c]));
    const blockedNames=new Set(directory.channels.filter(c=>c.is_nsfw).map(c=>normalize(c.name)));
    const blockedIds=new Set(directory.channels.filter(c=>c.is_nsfw).map(c=>c.id.toLowerCase()));
    const channels = new Map<string, ParsedXmlTv["channels"][number]>();
    const programs = new Map<string, ParsedXmlTv["programs"][number]>();
    for (const { value } of successful) {
      for (const c of value.channels) {
        const canonical = byId.get(c.externalId.split("@")[0]!.toLowerCase()) ?? byName.get(normalize(c.displayName));
        if(blockedNames.has(normalize(c.displayName))||blockedIds.has(c.externalId.split("@")[0]!.toLowerCase())) continue;
        // Country-specific override feeds may include regional pay-TV channels absent from the directory.
        if (!canonical && !countryFeed) continue;
        if (/adult|xxx|brazzers|hustler|penthouse|dorcel|erox|playboy|redlight|private\s*tv/i.test(c.displayName)) continue;
        channels.set(c.externalId, { ...c, country: this.country, canonicalId: canonical?.id ?? null });
      }
      for (const p of value.programs) if (channels.has(p.channelExternalId)) programs.set(p.sourceProgramId, p);
    }
    if (!programs.size) throw new Error("EPG_EMPTY_FEED");
    void options; // Favourites affect display/ranking, never import coverage.
    return { channels: [...channels.values()], programs: [...programs.values()], sourceTimestamp: successful[0]?.value.sourceTimestamp ?? null };
  }
}
