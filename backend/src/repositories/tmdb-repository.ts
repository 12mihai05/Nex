import { and, eq, gt, like, desc, inArray, sql } from "drizzle-orm";
import {normalizeSearch,rankSearch,titleRelevance} from '../services/search-ranking.js';
import { getConfig } from "../config.js";
import { contentItemSchema, type ContentItem, type MediaType } from "../domain/types.js";
import { fixtureCatalog, fixtureProviders } from "../fixtures/catalog.js";
import { getDatabase, type NexDatabase } from "../db/client.js";
import { tmdbCache } from "../db/schema.js";
import {conceptTerms} from "../services/concepts.js";
import {matchesGenre} from '../services/content-traits.js';
import {createHash} from "node:crypto";
import {lt} from "drizzle-orm";
import { normalizeVideos, seasonSummarySchema, episodeSchema, type TitleExtras, type SeasonExtras } from "../domain/title-extras.js";
import { releaseDate, movieReleases, seriesReleases, type ReleaseInfo } from '../domain/releases.js';

export interface CatalogSearchOptions {
  query: string;
  region: string;
  page?: number;
  summaryOnly?: boolean;
}

export interface DiscoverOptions {
  region: string;
  providerIds?: number[];
  mediaType?: MediaType | "any";
  maxRuntimeMinutes?: number | null;
  minRuntimeMinutes?: number | null;
  genres?: string[];
  genreMatch?: "any"|"all";
  keywords?: string[];
  originalLanguages?: string[];
  originCountries?: string[];
  page?: number;
  sortBy?: "vote_average.desc" | "popularity.desc";
  limit?: number;
  minYear?: number;
  maxYear?: number;
  minRating?: number;
  minVoteCount?: number;
}

export interface TmdbRepository {
  releases?(mediaType:MediaType,id:number,country:string):Promise<ReleaseInfo>;
  upcoming?(country:string,day:string,page:number):Promise<{items:ContentItem[];hasMore:boolean}>;
  knowledge?(type:'movie'|'series'|'person',id:number):Promise<Record<string,unknown>>;
  episodeKnowledge?(seriesId:number,season:number,episode:number):Promise<Record<string,unknown>>;
  people?(query:string):Promise<Array<{id:number;name:string}>>;
  extras?(mediaType: MediaType,id:number):Promise<TitleExtras>;
  season?(id:number,number:number):Promise<SeasonExtras>;
  titleAliases?(mediaType: MediaType, id: number): Promise<string[]>;
  readonly mode: "live" | "fixture";
  search(options: CatalogSearchOptions): Promise<ContentItem[]>;
  discover(options: DiscoverOptions): Promise<ContentItem[]>;
  getTitle(mediaType: MediaType, id: number, region: string, ownedProviderIds?: number[]): Promise<ContentItem | null>;
  getProviders(region: string): Promise<Array<{ id: number; name: string; logoUrl: string | null }>>;
  related?(mediaType: MediaType, id: number, region: string,limit?:number,page?:number): Promise<ContentItem[]>;
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
      if(options.minYear&&(item.year??0)<options.minYear)return false;
      if(options.maxYear&&(item.year??9999)>options.maxYear)return false;
      if(options.minRating&&(item.rating??0)<options.minRating)return false;
      if(options.minVoteCount&&(item.voteCount??0)<options.minVoteCount)return false;
      if (options.mediaType && options.mediaType !== "any" && item.mediaType !== options.mediaType) return false;
      if(options.originalLanguages?.length&&!options.originalLanguages.includes(item.originalLanguage??""))return false;
      if(options.originCountries?.length&&!item.countries?.some(c=>options.originCountries!.includes(c)))return false;
      if (options.maxRuntimeMinutes && item.runtimeMinutes && item.runtimeMinutes > options.maxRuntimeMinutes) return false;
      if (options.minRuntimeMinutes && (!item.runtimeMinutes || item.runtimeMinutes < options.minRuntimeMinutes)) return false;
      if (options.providerIds?.length && !item.availability.some((entry) => options.providerIds?.includes(entry.providerId))) return false;
      if (options.genres?.length && !(options.genreMatch==='all'?options.genres.every((genre)=>item.genres.some(g=>matchesGenre(genre,g))):options.genres.some((genre) => item.genres.some(g=>matchesGenre(genre,g))))) return false;
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
  async releases(mediaType:MediaType,id:number,country:string):Promise<ReleaseInfo> {
    // Fresh bounded lookup for scheduled checks, independent of the week-long metadata cache.
    const data=await this.fetchRequest<Record<string,unknown>>(`/${mediaType==='series'?'tv':'movie'}/${id}`,mediaType==='movie'?{append_to_response:'release_dates',language:'en-US'}:{language:'en-US'});
    return {title:String(data.title??data.name??'Untitled'),releases:mediaType==='movie'?movieReleases(data.release_dates,country):seriesReleases(data)};
  }
  async upcoming(country:string,day:string,page:number) {
    const payload=await this.request<{results:Record<string,unknown>[];total_pages:number}>('/discover/movie',{
      region:country,with_release_type:'3|2','release_date.gte':day,sort_by:'primary_release_date.asc',
      include_adult:'false',language:'en-US',page:String(page),
    });
    const items=await Promise.all(payload.results.map(async raw=>{
      const item=await this.summaryToItem({...raw,media_type:'movie'},country,true);
      return {...item,releaseDate:releaseDate(raw.release_date),releaseCountry:country,metadataOnly:true};
    }));
    return {items:items.filter(i=>i.releaseDate&&i.releaseDate>day).sort((a,b)=>a.releaseDate!.localeCompare(b.releaseDate!)||a.id-b.id),hasMore:page<Math.min(payload.total_pages,500)};
  }
  async episodeKnowledge(seriesId:number,season:number,episode:number):Promise<Record<string,unknown>> {
    const data=await this.request<Record<string,unknown>>(`/tv/${seriesId}/season/${season}/episode/${episode}`,{language:'en-US',append_to_response:'credits'});
    const credits=data.credits as {cast?:Array<Record<string,unknown>>;crew?:Array<Record<string,unknown>>}|undefined;
    return {id:data.id,name:data.name,overview:data.overview,air_date:data.air_date,runtime:data.runtime,
      season_number:data.season_number,episode_number:data.episode_number,
      cast:credits?.cast?.slice(0,30).map(p=>({id:p.id,name:p.name,character:p.character})),
      crew:credits?.crew?.filter(p=>['Director','Writer','Screenplay'].includes(String(p.job))).slice(0,20).map(p=>({id:p.id,name:p.name,job:p.job}))};
  }
  async people(query:string):Promise<Array<{id:number;name:string}>> {
    const data=await this.request<{results:Array<{id:number;name:string}>}>('/search/person',{query,include_adult:'false'});
    return data.results.slice(0,5).map(p=>({id:p.id,name:p.name}));
  }
  async knowledge(type:'movie'|'series'|'person',id:number):Promise<Record<string,unknown>> {
    const root=type==='series'?'tv':type;
    const data=await this.request<Record<string,unknown>>(`/${root}/${id}`,{language:'en-US',append_to_response:type==='person'?'combined_credits':'credits'});
    // Only public, relevant catalog facts. Do not forward the entire API payload.
    const fields=['id','name','title','overview','biography','birthday','deathday','place_of_birth','status','in_production','number_of_seasons','number_of_episodes','first_air_date','last_air_date','next_episode_to_air','last_episode_to_air','production_countries','created_by'];
    const result:Record<string,unknown>=Object.fromEntries(fields.filter(k=>data[k]!==undefined).map(k=>[k,data[k]]));
    const credits=(data.credits??data.combined_credits??{}) as {cast?:Array<Record<string,unknown>>;crew?:Array<Record<string,unknown>>};
    result.cast=(credits.cast??[]).slice(0,30).map(p=>({id:p.id,name:p.name,title:p.title??p.name,character:p.character,mediaType:p.media_type}));
    result.crew=(credits.crew??[]).filter(p=>['Director','Writer','Creator','Screenplay'].includes(String(p.job))).slice(0,20).map(p=>({id:p.id,name:p.name,title:p.title,job:p.job,mediaType:p.media_type}));
    return result;
  }
  async extras(mediaType:MediaType,id:number):Promise<TitleExtras> {
    const root=`/${mediaType==="series"?"tv":"movie"}/${id}`;
    const data=await this.request<Record<string,unknown>>(root,{append_to_response:"videos",language:"en-US",include_video_language:"en,null"});
    const seasons=Array.isArray(data.seasons)?data.seasons.flatMap(s=>{const parsed=seasonSummarySchema.safeParse(s);return parsed.success?[{number:parsed.data.season_number,name:parsed.data.name,episodeCount:parsed.data.episode_count,airDate:releaseDate(parsed.data.air_date)}]:[];}):[];
    let videos=normalizeVideos(data.videos);
    if(!videos.length)videos=normalizeVideos(await this.request(`${root}/videos`,{language:""}));
    return {videos,seasons};
  }
  async season(id:number,number:number):Promise<SeasonExtras> {
    const data=await this.request<Record<string,unknown>>(`/tv/${id}/season/${number}`,{append_to_response:"videos",language:"en-US",include_video_language:"en,null"});
    const episodes=Array.isArray(data.episodes)?data.episodes.flatMap(e=>{const p=episodeSchema.safeParse(e);return p.success?[{number:p.data.episode_number,name:p.data.name,runtimeMinutes:p.data.runtime||null,rating:p.data.vote_count?p.data.vote_average??null:null,airDate:p.data.air_date||null}]:[];}):[];
    let videos=normalizeVideos(data.videos);
    if(!videos.length)videos=normalizeVideos(await this.request(`/tv/${id}/season/${number}/videos`,{language:""}));
    return {videos,episodes};
  }
  async titleAliases(mediaType: MediaType, id: number): Promise<string[]> {
    const key=`aliases:${mediaType}:${id}`;
    const cached=await this.readCache(key);
    if(Array.isArray(cached)) return cached.filter((v):v is string=>typeof v==="string");
    const data=await this.request<{translations?:Array<{data?:{title?:string;name?:string}}>}>(`/${mediaType==="series"?"tv":"movie"}/${id}/translations`,{});
    const titles=[...new Set((data.translations??[]).flatMap(t=>[t.data?.title,t.data?.name]).filter((v):v is string=>Boolean(v)))].slice(0,80);
    await this.writeCache(key,"metadata",titles,getConfig().TMDB_METADATA_CACHE_TTL_SECONDS);
    return titles;
  }
  readonly mode = "live" as const;
  private readonly baseUrl = "https://api.themoviedb.org/3";
  private readonly imageBaseUrl = "https://image.tmdb.org/t/p";
  private readonly inFlight=new Map<string,Promise<unknown>>();
  private readonly memoryCache=new Map<string,{value:unknown;expires:number;bytes:number}>();
  private memoryBytes=0;
  private lastPrune=0;
  private readonly titleInFlight=new Map<string,Promise<ContentItem|null>>();
  private activeRequests=0;
  private readonly requestWaiters:Array<()=>void>=[];

  constructor(private readonly token: string, private readonly db: NexDatabase = getDatabase()) {}

  async search(options: CatalogSearchOptions): Promise<ContentItem[]> {
    const payload = await this.request<{ results?: Record<string, unknown>[] }>("/search/multi", {
      query: options.query, include_adult: "false", language: "en-US", page: String(options.page ?? 1), region: options.region,
    });
    const candidates = (payload.results ?? []).filter((result) => result.media_type === "movie" || result.media_type === "tv").slice(0, 20);
    const found=await Promise.all(candidates.map((result) => this.summaryToItem(result, options.region, options.summaryOnly)));
    if((options.page??1)===1&&!found.some(i=>Math.max(titleRelevance(options.query,i.title),titleRelevance(options.query,i.originalTitle??''))>=.68)){
      // TMDB can miss a multiword title after one typo. Retrieve by a remaining
      // distinctive word, then require a strong full-title match locally.
      const words=[...new Set(normalizeSearch(options.query).split(' ').filter(w=>w.length>=5))].sort((a,b)=>b.length-a.length).slice(0,2);
      if(normalizeSearch(options.query).split(' ').length>1){
        const fallbacks=await Promise.all(words.map(query=>this.request<{results?:Record<string,unknown>[]}>('/search/multi',{query,include_adult:'false',language:'en-US',page:'1',region:options.region}).catch(()=>({results:[]}))));
        for(const raw of fallbacks.flatMap(p=>p.results??[])){
          if(!['movie','tv'].includes(String(raw.media_type))||Math.max(titleRelevance(options.query,String(raw.title??raw.name??'')),titleRelevance(options.query,String(raw.original_title??raw.original_name??'')))<.68)continue;
          const mediaType=raw.media_type==='tv'?'series':'movie';
          if(!found.some(i=>i.id===Number(raw.id)&&i.mediaType===mediaType))found.push(await this.summaryToItem(raw,options.region,options.summaryOnly));
        }
      }
    }
    if((options.page??1)===1&&found.length<3&&options.query.trim().length>=5){
      // A small encountered-title cache helps typos without mirroring TMDB or
      // inventing corrected titles. Never use cached availability as a fresh claim.
      const cached=await this.db.select({payload:tmdbCache.payloadJson}).from(tmdbCache).where(and(like(tmdbCache.cacheKey,`title:%:${options.region}`),gt(tmdbCache.expiresAt,new Date()))).orderBy(desc(tmdbCache.updatedAt)).limit(300);
      for(const row of cached){try{const parsed=contentItemSchema.safeParse(JSON.parse(row.payload));if(parsed.success&&Math.max(titleRelevance(options.query,parsed.data.title),titleRelevance(options.query,parsed.data.originalTitle??''))>=.68&&!found.some(i=>i.id===parsed.data.id&&i.mediaType===parsed.data.mediaType)){
        const item=options.summaryOnly?{...parsed.data,availability:[]}:await this.getTitle(parsed.data.mediaType,parsed.data.id,options.region);
        if(item)found.push(item);
      }}catch{/* Invalid cached metadata is not a search result. */}}
    }
    return rankSearch(options.query,found).slice(0,20);
  }

  async discover(options: DiscoverOptions): Promise<ContentItem[]> {
    const types: MediaType[] = options.mediaType && options.mediaType !== "any" ? [options.mediaType] : ["movie", "series"];
    const results = await Promise.all(types.map(async (mediaType) => {
      const params: Record<string, string> = {
        include_adult: "false", language: "en-US", page: String(options.page ?? 1), sort_by: options.sortBy ?? "vote_average.desc",
        "vote_count.gte": String(options.minVoteCount??80), watch_region: options.region,
      };
      const dateField=mediaType==='series'?'first_air_date':'primary_release_date';
      if(options.minYear)params[`${dateField}.gte`]=`${options.minYear}-01-01`;
      if(options.maxYear)params[`${dateField}.lte`]=`${options.maxYear}-12-31`;
      if(options.minRating)params['vote_average.gte']=String(options.minRating);
      if (options.providerIds?.length) {
        params.with_watch_providers = options.providerIds.join("|");
        params.with_watch_monetization_types = "flatrate|free|ads";
      }
      if (options.maxRuntimeMinutes) params["with_runtime.lte"] = String(options.maxRuntimeMinutes);
      if (options.minRuntimeMinutes) params["with_runtime.gte"] = String(options.minRuntimeMinutes);
      if(options.originalLanguages?.length)params.with_original_language=options.originalLanguages.join("|");
      if(options.originCountries?.length)params.with_origin_country=options.originCountries.join("|");
      if (options.genres?.length) {
        const list = await this.request<{ genres: Array<{ id: number; name: string }> }>(`/genre/${mediaType === "series" ? "tv" : "movie"}/list`, { language: "en-US" });
        const ids = list.genres.filter((g)=>options.genres!.some((name)=>matchesGenre(name,g.name))).map((g)=>g.id);
        if (!ids.length) return [];
        if (ids.length) params.with_genres = ids.join(options.genreMatch==="all"?",":"|");
      }
      if (options.keywords?.length) {
        const ids=await Promise.all(options.keywords.slice(0,2).map(async keyword=>{
          const terms=conceptTerms(keyword).slice(0,6);
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
      await this.prefetchTitleCache((payload.results??[]).slice(0,options.limit??12).map(r=>({mediaType,id:Number(r.id)})),options.region);
      const hydrated=await Promise.allSettled((payload.results ?? []).slice(0, options.limit ?? 12).map((result) => this.summaryToItem({ ...result, media_type: mediaType === "series" ? "tv" : "movie" }, options.region)));
      return hydrated.flatMap(r=>r.status === "fulfilled"?[r.value]:[]);
    }));
    return results.flat();
  }

  async getTitle(mediaType: MediaType, id: number, region: string, ownedProviderIds: number[] = []): Promise<ContentItem | null> {
    const key = `title:${mediaType}:${id}:${region}`;
    let pending=this.titleInFlight.get(key);
    if(!pending) {pending=this.loadTitle(mediaType,id,region);this.titleInFlight.set(key,pending);}
    try {const item=await pending;return item?this.markOwned(item,ownedProviderIds):null;}
    finally {if(this.titleInFlight.get(key)===pending)this.titleInFlight.delete(key);}
  }

  private async loadTitle(mediaType: MediaType,id:number,region:string):Promise<ContentItem|null> {
    const ownedProviderIds:number[]=[];
    const key = `title:${mediaType}:${id}:${region}`;
    const cached = await this.readCache(key);
    if (cached) {
      const item = contentItemSchema.parse(cached);
      const availability = await this.readCache(`availability:${mediaType}:${id}:${region}`);
      if (availability && (item.releaseDate!==undefined || (item.year??9999)<new Date().getUTCFullYear())) return this.markOwned({ ...item, availability: contentItemSchema.shape.availability.parse(availability) },ownedProviderIds);
    }
    try {
      const path = `/${mediaType === "series" ? "tv" : "movie"}/${id}`;
      const detail = await this.request<Record<string, unknown>>(path, { append_to_response: "credits,keywords,watch/providers", language: "en-US" });
      const item = this.detailToItem(detail, mediaType, region, ownedProviderIds);
      await this.writeCaches([
        {key, kind:"metadata", payload:item, ttlSeconds:getConfig().TMDB_METADATA_CACHE_TTL_SECONDS},
        {key:`availability:${mediaType}:${id}:${region}`, kind:"availability", payload:item.availability, ttlSeconds:getConfig().TMDB_AVAILABILITY_CACHE_TTL_SECONDS},
      ]);
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

  async related(mediaType: MediaType, id: number, region: string,limit=6,page=1): Promise<ContentItem[]> {
    const payload = await this.request<{ results: Array<Record<string,unknown>> }>(`/${mediaType === "series" ? "tv" : "movie"}/${id}/recommendations`, { language: "en-US",page:String(page) });
    const rows=payload.results.slice(0,Math.min(20,Math.max(1,limit)));
    await this.prefetchTitleCache(rows.map(r=>({mediaType,id:Number(r.id)})),region);
    const found=await Promise.allSettled(rows.map((r)=>this.summaryToItem({ ...r, media_type: mediaType === "series" ? "tv" : "movie" },region)));
    return found.flatMap(r=>r.status==='fulfilled'?[r.value]:[]);
  }

  private async summaryToItem(value: Record<string, unknown>, region: string, summaryOnly = false): Promise<ContentItem> {
    const mediaType: MediaType = value.media_type === "tv" ? "series" : "movie";
    const id = Number(value.id);
    const detailed = !summaryOnly && Number.isFinite(id) ? await this.getTitle(mediaType, id, region) : null;
    if (detailed) return detailed;
    const title = String(value.title ?? value.name ?? "Untitled");
    return tmdbResultSchema.pipe(contentItemSchema).parse({
      id, mediaType, title, originalTitle: String(value.original_title ?? value.original_name ?? title), overview: String(value.overview ?? ""),
      releaseDate:releaseDate(value.release_date ?? value.first_air_date),
      year: this.year(value.release_date ?? value.first_air_date), runtimeMinutes: null, rating: Number(value.vote_count)>0&&typeof value.vote_average === "number" ? value.vote_average : null,
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
      releaseDate:releaseDate(value.release_date ?? value.first_air_date),
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
    // Detailed title metadata already has a normalized, country-keyed cache.
    // Persisting the giant raw credits/providers response duplicates every write.
    const cacheable=/^\/(genre\/|search\/|discover\/)|\/(recommendations|videos)$/.test(path)||Boolean(params.append_to_response && params.append_to_response!=='credits,keywords,watch/providers');
    const key=`request:${createHash("sha256").update(JSON.stringify([path,Object.entries(params).sort()])).digest("hex")}`;
    if(!cacheable)return this.fetchRequest<T>(path,params);
    const pending=this.inFlight.get(key);if(pending)return pending as Promise<T>;
    const task=(async()=>{
      const cached=await this.readCache(key);if(cached)return cached as T;
      const value=await this.fetchRequest<T>(path,params);
      const ttl=params.append_to_response==="videos"?getConfig().TMDB_METADATA_CACHE_TTL_SECONDS:path.startsWith("/genre/")||path==="/search/keyword"?86400:path.endsWith("/recommendations")?3600:300;
      await this.writeCache(key,"public_request",value,ttl);return value;
    })();
    if(this.inFlight.size<128)this.inFlight.set(key,task);
    try{return await task;}finally{if(this.inFlight.get(key)===task)this.inFlight.delete(key);}
  }

  private async fetchRequest<T>(path: string, params: Record<string,string>):Promise<T>{
    if(this.activeRequests>=8) await new Promise<void>(resolve=>this.requestWaiters.push(resolve));
    else this.activeRequests++;
    try {
    const url = new URL(`${this.baseUrl}${path}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetch(url, { headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new TmdbError(response.status);
    return await response.json() as T;
    } finally {
      const next=this.requestWaiters.shift();
      if(next)next();else this.activeRequests--;
    }
  }

  private async prefetchTitleCache(items:Array<{mediaType:MediaType;id:number}>,region:string){
    const now=Date.now();
    const keys=[...new Set(items.filter(i=>Number.isInteger(i.id)&&i.id>0).flatMap(i=>[`title:${i.mediaType}:${i.id}:${region}`,`availability:${i.mediaType}:${i.id}:${region}`]))]
      .filter(key=>(this.memoryCache.get(key)?.expires??0)<=now);
    if(!keys.length)return;
    // One database round trip per candidate batch, rather than two per title.
    const rows=await this.db.select().from(tmdbCache).where(and(inArray(tmdbCache.cacheKey,keys),gt(tmdbCache.expiresAt,new Date()))).catch(()=>[]);
    for(const key of keys)this.rememberCache(key,null,now+5000);
    for(const row of rows){try{this.rememberCache(row.cacheKey,JSON.parse(row.payloadJson),+row.expiresAt);}catch{/* Invalid cache entries are refetched. */}}
  }

  private async readCache(key: string): Promise<unknown | null> {
    const memory=this.memoryCache.get(key);
    if(memory&&memory.expires>Date.now()){
      this.memoryCache.delete(key);this.memoryCache.set(key,memory);return memory.value;
    }
    this.forgetCache(key);
    const rows = await this.db.select().from(tmdbCache).where(and(eq(tmdbCache.cacheKey, key), gt(tmdbCache.expiresAt, new Date()))).limit(1).catch(()=>[]);
    if (!rows[0]) return null;
    try { const value=JSON.parse(rows[0].payloadJson);this.rememberCache(key,value,+rows[0].expiresAt);return value; } catch { return null; }
  }

  private rememberCache(key:string,value:unknown,expires:number){
    this.forgetCache(key);
    const bytes=Buffer.byteLength(JSON.stringify(value));
    // Six shelves need more than 256 title/availability/request entries. Bound
    // both count and bytes, with LRU reuse, rather than thrashing each batch.
    if(bytes>8*1024*1024)return;
    while(this.memoryCache.size>=1024 || this.memoryBytes+bytes>8*1024*1024)this.forgetCache(this.memoryCache.keys().next().value!);
    this.memoryCache.set(key,{value,bytes,expires:Math.min(expires,Date.now()+60000)});
    this.memoryBytes+=bytes;
  }

  private forgetCache(key:string){
    this.memoryBytes-=this.memoryCache.get(key)?.bytes??0;this.memoryCache.delete(key);
  }

  private async writeCache(key: string, kind: string, payload: unknown, ttlSeconds: number): Promise<void> {
    return this.writeCaches([{key,kind,payload,ttlSeconds}]);
  }

  private async writeCaches(entries:Array<{key:string;kind:string;payload:unknown;ttlSeconds:number}>):Promise<void>{
    const now = new Date();
    for(const e of entries)this.rememberCache(e.key,e.payload,now.getTime()+e.ttlSeconds*1000);
    try {
    if(+now-this.lastPrune>3600000){this.lastPrune=+now;await this.db.delete(tmdbCache).where(lt(tmdbCache.expiresAt,now));}
    await this.db.insert(tmdbCache).values(entries.map(e=>({cacheKey:e.key,kind:e.kind,payloadJson:JSON.stringify(e.payload),expiresAt:new Date(+now+e.ttlSeconds*1000),createdAt:now,updatedAt:now})))
      .onConflictDoUpdate({ target: tmdbCache.cacheKey, set: { payloadJson: sql`excluded.payload_json`, expiresAt: sql`excluded.expires_at`, updatedAt: now } });
    } catch { /* Public metadata remains usable when cache persistence fails. */ }
  }
}

export class TmdbError extends Error {
  constructor(public readonly status: number) { super(`TMDB request failed (${status})`); }
}

export function createTmdbRepository(): TmdbRepository {
  const token = getConfig().TMDB_READ_ACCESS_TOKEN;
  return token ? new LiveTmdbRepository(token) : new FixtureTmdbRepository();
}
