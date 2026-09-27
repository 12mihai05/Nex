import { and, eq, gt } from "drizzle-orm";
import { getConfig } from "../config.js";
import { contentItemSchema, type ContentItem, type MediaType } from "../domain/types.js";
import { fixtureCatalog, fixtureProviders } from "../fixtures/catalog.js";
import { getDatabase, type NexDatabase } from "../db/client.js";
import { tmdbCache } from "../db/schema.js";
import {conceptTerms} from "../services/concepts.js";
import {createHash} from "node:crypto";
import {lt} from "drizzle-orm";

export interface CatalogSearchOptions {
  query: string;
  region: string;
  page?: number;
}

export interface DiscoverOptions {
  region: string;
  providerIds?: number[];
  mediaType?: MediaType | "any";
  maxRuntimeMinutes?: number | null;
  genres?: string[];
  genreMatch?: "any"|"all";
  keywords?: string[];
  originalLanguages?: string[];
  page?: number;
  sortBy?: "vote_average.desc" | "popularity.desc";
  limit?: number;
}

export interface TmdbRepository {
  readonly mode: "live" | "fixture";
  search(options: CatalogSearchOptions): Promise<ContentItem[]>;
  discover(options: DiscoverOptions): Promise<ContentItem[]>;
  getTitle(mediaType: MediaType, id: number, region: string, ownedProviderIds?: number[]): Promise<ContentItem | null>;
  getProviders(region: string): Promise<Array<{ id: number; name: string; logoUrl: string | null }>>;
  related?(mediaType: MediaType, id: number, region: string): Promise<ContentItem[]>;
}

export class FixtureTmdbRepository implements TmdbRepository {
  readonly mode = "fixture" as const;

  async search({ query }: CatalogSearchOptions): Promise<ContentItem[]> {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return fixtureCatalog;
    return fixtureCatalog.filter((item) =>
      [item.title, item.originalTitle ?? "", ...item.genres, ...item.cast]
        .some((value) => value.toLocaleLowerCase().includes(normalized)),
    );
  }

  async discover(options: DiscoverOptions): Promise<ContentItem[]> {
    return fixtureCatalog.filter((item) => {
      if (options.mediaType && options.mediaType !== "any" && item.mediaType !== options.mediaType) return false;
      if(options.originalLanguages?.length&&!options.originalLanguages.includes(item.originalLanguage??""))return false;
      if (options.maxRuntimeMinutes && item.runtimeMinutes && item.runtimeMinutes > options.maxRuntimeMinutes) return false;
      if (options.providerIds?.length && !item.availability.some((entry) => options.providerIds?.includes(entry.providerId))) return false;
      if (options.genres?.length && !options.genres.some((genre) => item.genres.some((g) => g.toLowerCase() === genre.toLowerCase()))) return false;
      return true;
    });
  }

  async getTitle(mediaType: MediaType, id: number, _region: string, ownedProviderIds: number[] = []): Promise<ContentItem | null> {
    const item = fixtureCatalog.find((candidate) => candidate.id === id && candidate.mediaType === mediaType);
    if (!item) return null;
    return { ...item, availability: item.availability.map((entry) => ({ ...entry, owned: ownedProviderIds.length ? ownedProviderIds.includes(entry.providerId) : entry.owned })) };
  }

  async getProviders(): Promise<typeof fixtureProviders> {
    return fixtureProviders;
  }
}

const tmdbResultSchema = contentItemSchema.partial().passthrough();

export class LiveTmdbRepository implements TmdbRepository {
  readonly mode = "live" as const;
  private readonly baseUrl = "https://api.themoviedb.org/3";
  private readonly imageBaseUrl = "https://image.tmdb.org/t/p";
  private readonly inFlight=new Map<string,Promise<unknown>>();
  private lastPrune=0;

  constructor(private readonly token: string, private readonly db: NexDatabase = getDatabase()) {}

  async search(options: CatalogSearchOptions): Promise<ContentItem[]> {
    const payload = await this.request<{ results?: Record<string, unknown>[] }>("/search/multi", {
      query: options.query, include_adult: "false", language: "en-US", page: String(options.page ?? 1), region: options.region,
    });
    const candidates = (payload.results ?? []).filter((result) => result.media_type === "movie" || result.media_type === "tv").slice(0, 20);
    return Promise.all(candidates.map((result) => this.summaryToItem(result, options.region)));
  }

  async discover(options: DiscoverOptions): Promise<ContentItem[]> {
    const types: MediaType[] = options.mediaType && options.mediaType !== "any" ? [options.mediaType] : ["movie", "series"];
    const results = await Promise.all(types.map(async (mediaType) => {
      const params: Record<string, string> = {
        include_adult: "false", language: "en-US", page: String(options.page ?? 1), sort_by: options.sortBy ?? "vote_average.desc",
        "vote_count.gte": "80", watch_region: options.region,
      };
      if (options.providerIds?.length) {
        params.with_watch_providers = options.providerIds.join("|");
        params.with_watch_monetization_types = "flatrate|free|ads";
      }
      if (options.maxRuntimeMinutes) params["with_runtime.lte"] = String(options.maxRuntimeMinutes);
      if(options.originalLanguages?.length)params.with_original_language=options.originalLanguages.join("|");
      if (options.genres?.length) {
        const list = await this.request<{ genres: Array<{ id: number; name: string }> }>(`/genre/${mediaType === "series" ? "tv" : "movie"}/list`, { language: "en-US" });
        const ids = list.genres.filter((g)=>options.genres!.some((name)=>name.toLowerCase() === g.name.toLowerCase())).map((g)=>g.id);
        if (ids.length) params.with_genres = ids.join(options.genreMatch==="all"?",":"|");
      }
      if (options.keywords?.length) {
        const ids=await Promise.all(options.keywords.slice(0,2).map(async keyword=>{
          const terms=conceptTerms(keyword).slice(0,3);
          const matches=await Promise.all(terms.map(async term=>{
            const result=await this.request<{results:Array<{id:number;name:string}>}>("/search/keyword",{query:term,page:"1"});
            return result.results.filter(k=>terms.some(t=>k.name.toLowerCase()===t.toLowerCase())).map(k=>k.id);
          }));
          return matches.flat();
        }));
        const verified=[...new Set(ids.flat())];
        if(!verified.length) return [];
        params.with_keywords=verified.join("|");
      }
      const payload = await this.request<{ results?: Record<string, unknown>[] }>(`/discover/${mediaType === "series" ? "tv" : "movie"}`, params);
      const hydrated=await Promise.allSettled((payload.results ?? []).slice(0, options.limit ?? 12).map((result) => this.summaryToItem({ ...result, media_type: mediaType === "series" ? "tv" : "movie" }, options.region)));
      return hydrated.flatMap(r=>r.status === "fulfilled"?[r.value]:[]);
    }));
    return results.flat();
  }

  async getTitle(mediaType: MediaType, id: number, region: string, ownedProviderIds: number[] = []): Promise<ContentItem | null> {
    const key = `title:${mediaType}:${id}:${region}`;
    const cached = await this.readCache(key);
    if (cached) {
      const item = contentItemSchema.parse(cached);
      const availability = await this.readCache(`availability:${mediaType}:${id}:${region}`);
      if (availability) return this.markOwned({ ...item, availability: contentItemSchema.shape.availability.parse(availability) },ownedProviderIds);
    }
    try {
      const path = `/${mediaType === "series" ? "tv" : "movie"}/${id}`;
      const detail = await this.request<Record<string, unknown>>(path, { append_to_response: "credits,keywords,watch/providers", language: "en-US" });
      const item = this.detailToItem(detail, mediaType, region, ownedProviderIds);
      await this.writeCache(key, "metadata", item, getConfig().TMDB_METADATA_CACHE_TTL_SECONDS);
      await this.writeCache(`availability:${mediaType}:${id}:${region}`, "availability", item.availability, getConfig().TMDB_AVAILABILITY_CACHE_TTL_SECONDS);
      return item;
    } catch (error) {
      if (error instanceof TmdbError && error.status === 404) return null;
      throw error;
    }
  }

  async getProviders(region: string): Promise<Array<{ id: number; name: string; logoUrl: string | null }>> {
    const key = `providers:${region}`;
    const cached = await this.readCache(key);
    if (Array.isArray(cached)) return cached as Array<{ id: number; name: string; logoUrl: string | null }>;
    const payload = await this.request<{ results?: Array<{ provider_id: number; provider_name: string; logo_path?: string }> }>("/watch/providers/movie", { watch_region: region, language: "en-US" });
    const providers = (payload.results ?? []).map((entry) => ({ id: entry.provider_id, name: entry.provider_name, logoUrl: entry.logo_path ? `${this.imageBaseUrl}/w92${entry.logo_path}` : null }));
    await this.writeCache(key, "providers", providers, getConfig().TMDB_METADATA_CACHE_TTL_SECONDS);
    return providers;
  }

  async related(mediaType: MediaType, id: number, region: string): Promise<ContentItem[]> {
    const payload = await this.request<{ results: Array<Record<string,unknown>> }>(`/${mediaType === "series" ? "tv" : "movie"}/${id}/recommendations`, { language: "en-US" });
    return Promise.all(payload.results.slice(0,6).map((r)=>this.summaryToItem({ ...r, media_type: mediaType === "series" ? "tv" : "movie" },region)));
  }

  private async summaryToItem(value: Record<string, unknown>, region: string): Promise<ContentItem> {
    const mediaType: MediaType = value.media_type === "tv" ? "series" : "movie";
    const id = Number(value.id);
    const detailed = Number.isFinite(id) ? await this.getTitle(mediaType, id, region) : null;
    if (detailed) return detailed;
    const title = String(value.title ?? value.name ?? "Untitled");
    return tmdbResultSchema.pipe(contentItemSchema).parse({
      id, mediaType, title, originalTitle: String(value.original_title ?? value.original_name ?? title), overview: String(value.overview ?? ""),
      year: this.year(value.release_date ?? value.first_air_date), runtimeMinutes: null, rating: typeof value.vote_average === "number" ? value.vote_average : null,
      popularity: Number(value.popularity ?? 0), posterUrl: this.image(value.poster_path, "w500"), backdropUrl: this.image(value.backdrop_path, "w1280"),
      genres: [], genreIds: Array.isArray(value.genre_ids) ? value.genre_ids.map(Number) : [], moods: [], keywords: [], cast: [], director: null,
      originalLanguage: typeof value.original_language === "string" ? value.original_language : null, availability: [],
    });
  }

  private detailToItem(value: Record<string, any>, mediaType: MediaType, region: string, ownedProviderIds: number[]): ContentItem {
    const providerData = value["watch/providers"]?.results?.[region] ?? {};
    const entries = [
      ...(providerData.flatrate ?? []).map((p: any) => ({ ...p, access: "included" })),
      ...(providerData.free ?? []).map((p: any) => ({ ...p, access: "included" })),
      ...(providerData.ads ?? []).map((p: any) => ({ ...p, access: "included" })),
      ...(providerData.rent ?? []).map((p: any) => ({ ...p, access: "rent" })),
      ...(providerData.buy ?? []).map((p: any) => ({ ...p, access: "buy" })),
    ];
    const seen = new Set<string>();
    const availability = entries.filter((p: any) => {
      const key = `${p.provider_id}:${p.access}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).map((p: any) => ({
      providerId: Number(p.provider_id), providerName: String(p.provider_name), logoUrl: this.image(p.logo_path, "w92"), access: p.access,
      owned: ownedProviderIds.includes(Number(p.provider_id)),
    }));
    const crew: Array<Record<string, unknown>> = value.credits?.crew ?? [];
    const keywords = value.keywords?.keywords ?? value.keywords?.results ?? [];
    return contentItemSchema.parse({
      id: Number(value.id), mediaType, title: String(value.title ?? value.name), originalTitle: String(value.original_title ?? value.original_name ?? value.title ?? value.name),
      overview: String(value.overview ?? ""), year: this.year(value.release_date ?? value.first_air_date),
      runtimeMinutes: Number(value.runtime ?? value.episode_run_time?.[0]) || null, rating: Number(value.vote_average) || null, popularity: Number(value.popularity ?? 0),
      voteCount: Number(value.vote_count ?? 0), countries: (value.production_countries ?? []).map((c: any)=>String(c.iso_3166_1)), collection: value.belongs_to_collection?.name ?? null,
      posterUrl: this.image(value.poster_path, "w500"), backdropUrl: this.image(value.backdrop_path, "w1280"),
      genres: (value.genres ?? []).map((g: any) => String(g.name)), genreIds: (value.genres ?? []).map((g: any) => Number(g.id)), moods: [],
      keywords: keywords.slice(0, 40).map((k: any) => String(k.name)), cast: (value.credits?.cast ?? []).slice(0, 8).map((c: any) => String(c.name)),
      director: (crew.find((c) => c.job === "Director")?.name as string | undefined) ?? null,
      originalLanguage: typeof value.original_language === "string" ? value.original_language : null, availability,
    });
  }

  private markOwned(item: ContentItem, providerIds: number[]): ContentItem {
    return { ...item, availability: item.availability.map((entry) => ({ ...entry, owned: providerIds.includes(entry.providerId) })) };
  }

  private image(path: unknown, size: string): string | null {
    return typeof path === "string" && path ? `${this.imageBaseUrl}/${size}${path}` : null;
  }

  private year(value: unknown): number | null {
    if (typeof value !== "string") return null;
    const year = Number(value.slice(0, 4));
    return Number.isFinite(year) ? year : null;
  }

  private async request<T>(path: string, params: Record<string, string>): Promise<T> {
    const cacheable=/^\/(genre\/|search\/|discover\/)|\/recommendations$/.test(path);
    const key=`request:${createHash("sha256").update(JSON.stringify([path,Object.entries(params).sort()])).digest("hex")}`;
    if(!cacheable)return this.fetchRequest<T>(path,params);
    const pending=this.inFlight.get(key);if(pending)return pending as Promise<T>;
    const task=(async()=>{
      const cached=await this.readCache(key);if(cached)return cached as T;
      const value=await this.fetchRequest<T>(path,params);
      const ttl=path.startsWith("/genre/")||path==="/search/keyword"?86400:path.endsWith("/recommendations")?3600:300;
      await this.writeCache(key,"public_request",value,ttl);return value;
    })();
    if(this.inFlight.size<128)this.inFlight.set(key,task);
    try{return await task;}finally{if(this.inFlight.get(key)===task)this.inFlight.delete(key);}
  }

  private async fetchRequest<T>(path: string, params: Record<string,string>):Promise<T>{
    const url = new URL(`${this.baseUrl}${path}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetch(url, { headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new TmdbError(response.status);
    return await response.json() as T;
  }

  private async readCache(key: string): Promise<unknown | null> {
    const rows = await this.db.select().from(tmdbCache).where(and(eq(tmdbCache.cacheKey, key), gt(tmdbCache.expiresAt, new Date()))).limit(1);
    if (!rows[0]) return null;
    try { return JSON.parse(rows[0].payloadJson); } catch { return null; }
  }

  private async writeCache(key: string, kind: string, payload: unknown, ttlSeconds: number): Promise<void> {
    const now = new Date();
    if(+now-this.lastPrune>3600000){this.lastPrune=+now;await this.db.delete(tmdbCache).where(lt(tmdbCache.expiresAt,now));}
    await this.db.insert(tmdbCache).values({ cacheKey: key, kind, payloadJson: JSON.stringify(payload), expiresAt: new Date(now.getTime() + ttlSeconds * 1000), createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: tmdbCache.cacheKey, set: { payloadJson: JSON.stringify(payload), expiresAt: new Date(now.getTime() + ttlSeconds * 1000), updatedAt: now } });
  }
}

export class TmdbError extends Error {
  constructor(public readonly status: number) { super(`TMDB request failed (${status})`); }
}

export function createTmdbRepository(): TmdbRepository {
  const token = getConfig().TMDB_READ_ACCESS_TOKEN;
  return token ? new LiveTmdbRepository(token) : new FixtureTmdbRepository();
}
