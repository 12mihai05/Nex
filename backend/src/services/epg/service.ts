import { and, eq, gt, lt, or, sql, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getConfig } from "../../config.js";
import { channels, channelFavorites, epgPrograms, epgSyncRuns, epgTmdbMatches } from "../../db/schema.js";
import { getDatabase, type NexDatabase } from "../../db/client.js";
import { createTmdbRepository, type TmdbRepository } from "../../repositories/tmdb-repository.js";
import { createEpgProvider, type EpgProvider } from "./provider.js";
import { bestEpgMatch, type MatchResult } from "./matcher.js";
import { normalizeEpgTitle, type NormalizedProgram } from "./xmltv.js";

export class EpgService {
  constructor(private readonly db: NexDatabase = getDatabase(), private readonly provider: EpgProvider = createEpgProvider(), private readonly catalog: TmdbRepository = createTmdbRepository()) {}

  async sync(now = new Date()): Promise<{ sourceId: string; importedRows: number; deletedRows: number }> {
    const config = getConfig();
    const minDate = new Date(now.getTime() - config.EPG_RETENTION_PAST_DAYS * 86_400_000);
    const maxDate = new Date(now.getTime() + config.EPG_RETENTION_FUTURE_DAYS * 86_400_000);
    // Retention must still run when an upstream feed is unavailable.
    const expired = await this.db.delete(epgPrograms).where(or(lt(epgPrograms.endAt,minDate),gt(epgPrograms.startAt,maxDate))).returning({id:epgPrograms.id});
    const runId = randomUUID();
    await this.db.update(epgSyncRuns).set({ status:"failed",errorCode:"SYNC_LEASE_EXPIRED",finishedAt:now }).where(and(eq(epgSyncRuns.sourceId,this.provider.sourceId),eq(epgSyncRuns.status,"running"),lt(epgSyncRuns.startedAt,new Date(now.getTime()-15*60_000))));
    try { await this.db.insert(epgSyncRuns).values({ id: runId, sourceId: this.provider.sourceId, status: "running", startedAt: now }); }
    catch { throw new Error("EPG_SYNC_BUSY_OR_UNAVAILABLE"); }
    try {
      const favorites=await this.db.selectDistinct({externalId:channels.externalId}).from(channelFavorites).innerJoin(channels,eq(channels.id,channelFavorites.channelId)).where(eq(channels.sourceId,this.provider.sourceId));
      const parsed = await this.provider.load({preferredExternalIds:new Set(favorites.map(f=>f.externalId))});
      if (!parsed.programs.some((p)=>p.endAt>now&&p.startAt<=maxDate)) throw new Error("EPG_STALE_FEED");
      const channelIds = new Map<string, string>();
      const channelRows=parsed.channels.map(channel=>{
        const id = `${this.provider.sourceId}:${channel.externalId}`;
        channelIds.set(channel.externalId, id);
        return { id, sourceId: this.provider.sourceId, country: this.provider.country ?? "RO", ...channel };
      });
      let importedRows = 0;
      let matchesAttempted = 0;
      const rows: Array<typeof epgPrograms.$inferInsert> = [];
      const localMatches = new Map<string, MatchResult | null>();
      for (const program of parsed.programs.filter((p) => p.endAt >= minDate && p.startAt <= maxDate)) {
        const channelId = channelIds.get(program.channelExternalId);
        if (!channelId) continue;
        const id = `${this.provider.sourceId}:${program.sourceProgramId}`;
        const key = `${normalizeEpgTitle(program.title)}:${program.year}:${program.category}`;
        if (!localMatches.has(key) && /movie|film|serial|series/i.test(program.category ?? "") && matchesAttempted < config.EPG_MAX_MATCHES_PER_SYNC) {
          matchesAttempted++;
          localMatches.set(key, await this.resolveMatch(program).catch(() => null));
        }
        const match = localMatches.get(key);
        rows.push({ id, sourceId: this.provider.sourceId, sourceProgramId: program.sourceProgramId, channelId, title: program.title, subtitle: program.subtitle, description: program.description, startAt: program.startAt, endAt: program.endAt, category: program.category, language: program.language, year: program.year, matchedTmdbId: match?.tmdbId, matchedMediaType: match?.mediaType, matchConfidence: match?.confidence, updatedAt: now });
        importedRows += 1;
      }
      if (!rows.length) throw new Error("EPG_NO_CURRENT_PROGRAMS");
      // Small batches respect SQLite variable limits and keep remote round trips bounded.
      await this.db.transaction(async (tx) => {
        await tx.update(channels).set({active:false}).where(eq(channels.sourceId,this.provider.sourceId));
        for(let i=0;i<channelRows.length;i+=50)await tx.insert(channels).values(channelRows.slice(i,i+50)).onConflictDoUpdate({target:[channels.sourceId,channels.externalId],set:{active:true,displayName:sql`excluded.display_name`,logoUrl:sql`excluded.logo_url`,language:sql`excluded.language`,canonicalId:sql`excluded.canonical_id`,updatedAt:now}});
        for (let i = 0; i < rows.length; i += 40) {
          await tx.insert(epgPrograms).values(rows.slice(i, i + 40)).onConflictDoUpdate({ target: [epgPrograms.sourceId, epgPrograms.sourceProgramId], set: {
            title: sql`excluded.title`, description: sql`excluded.description`, endAt: sql`excluded.end_at`, updatedAt: now,
            matchedTmdbId: sql`coalesce(excluded.matched_tmdb_id, epg_programs.matched_tmdb_id)`, matchedMediaType: sql`coalesce(excluded.matched_media_type, epg_programs.matched_media_type)`, matchConfidence: sql`coalesce(excluded.match_confidence, epg_programs.match_confidence)`,
          } });
        }
        // Remove replaced schedules only after the complete new snapshot has been imported.
        await tx.delete(epgPrograms).where(and(eq(epgPrograms.sourceId, this.provider.sourceId), gt(epgPrograms.endAt, now), lt(epgPrograms.updatedAt, now)));
      });
      const removed = await this.db.delete(epgPrograms).where(and(eq(epgPrograms.sourceId, this.provider.sourceId), or(lt(epgPrograms.endAt, minDate), gt(epgPrograms.startAt, maxDate)))).returning({ id: epgPrograms.id });
      await this.db.update(epgSyncRuns).set({ status: "success", finishedAt: new Date(), sourceTimestamp: parsed.sourceTimestamp, importedRows, deletedRows: removed.length+expired.length }).where(eq(epgSyncRuns.id, runId));
      await this.db.delete(epgSyncRuns).where(lt(epgSyncRuns.startedAt,new Date(now.getTime()-30*86_400_000)));
      return { sourceId: this.provider.sourceId, importedRows, deletedRows: removed.length+expired.length };
    } catch (error) {
      await this.db.update(epgSyncRuns).set({ status: "failed", finishedAt: new Date(), errorCode: error instanceof Error ? error.name : "UnknownError" }).where(eq(epgSyncRuns.id, runId));
      throw error;
    }
  }

  async listWindow(start: Date, end: Date, country = "RO", userId="",options:{futureOnly?:boolean;channelId?:string;offset?:number}={}) {
    const favorite=sql<boolean>`exists(select 1 from channel_favorites f where f.channel_id=${channels.id} and f.user_id=${userId})`.mapWith(Boolean);
    const bucket=sql<number>`case when ${epgPrograms.startAt}<=${+start} then 0 when ${epgPrograms.startAt}<${+start+30*60_000} then 1 when ${epgPrograms.startAt}<${+start+60*60_000} then 2 else 3 end`;
    return this.db.select({
      favorite,
      id: epgPrograms.id, title: epgPrograms.title, subtitle: epgPrograms.subtitle, description: epgPrograms.description,
      startAt: epgPrograms.startAt, endAt: epgPrograms.endAt, category: epgPrograms.category,
      matchedTmdbId: epgPrograms.matchedTmdbId, matchedMediaType: epgPrograms.matchedMediaType, matchConfidence: epgPrograms.matchConfidence,
      channel: { id: channels.id, name: channels.displayName, logoUrl: channels.logoUrl },
    }).from(epgPrograms).innerJoin(channels, eq(epgPrograms.channelId, channels.id))
      .where(and(eq(channels.country, country),eq(channels.active,true), lt(epgPrograms.startAt, end), gt(epgPrograms.endAt, start),options.futureOnly?gt(epgPrograms.startAt,start):undefined,options.channelId?eq(channels.id,options.channelId):undefined)).orderBy(bucket,desc(favorite),epgPrograms.startAt,channels.displayName,epgPrograms.id).limit(100).offset(options.offset??0);
  }

  async listChannels(userId:string,country:string,search="",offset=0,favoritesOnly=false){
    const favorite=sql<boolean>`exists(select 1 from channel_favorites f where f.channel_id=${channels.id} and f.user_id=${userId})`.mapWith(Boolean);
    const available=sql<boolean>`${channels.active}=1 and exists(select 1 from epg_programs p where p.channel_id=${channels.id} and p.end_at>${Date.now()})`.mapWith(Boolean);
    return this.db.select({id:channels.id,name:channels.displayName,logoUrl:channels.logoUrl,favorite,available,active:channels.active}).from(channels).where(and(eq(channels.country,country),or(eq(channels.active,true),favorite),sql`instr(lower(${channels.displayName}),lower(${search}))>0`,favoritesOnly?favorite:undefined)).orderBy(desc(favorite),channels.displayName,channels.id).limit(50).offset(offset);
  }

  async setChannelFavorite(userId:string,country:string,channelId:string,favorite:boolean){
    await this.db.transaction(async tx=>{
      const channel=(await tx.select().from(channels).where(and(eq(channels.id,channelId),eq(channels.country,country))).limit(1))[0];
      if(!channel)throw new Error("CHANNEL_NOT_FOUND");
      if(!favorite){await tx.delete(channelFavorites).where(and(eq(channelFavorites.userId,userId),eq(channelFavorites.channelId,channelId)));return;}
      if(!channel.active)throw new Error("CHANNEL_NOT_FOUND");
      const own=await tx.select().from(channelFavorites).innerJoin(channels,eq(channels.id,channelFavorites.channelId)).where(and(eq(channelFavorites.userId,userId),eq(channels.country,country)));
      if(own.some(f=>f.channel_favorites.channelId===channelId))return;
      if(own.length>=20)throw new Error("CHANNEL_FAVORITE_LIMIT");
      const countryFavorites=await tx.selectDistinct({id:channelFavorites.channelId}).from(channelFavorites).innerJoin(channels,eq(channels.id,channelFavorites.channelId)).where(eq(channels.country,country));
      if(countryFavorites.length>=120&&!countryFavorites.some(f=>f.id===channelId))throw new Error("CHANNEL_FAVORITE_CAPACITY");
      await tx.insert(channelFavorites).values({userId,channelId}).onConflictDoNothing();
    });
  }

  async status(country: string) {
    return this.db.select().from(epgSyncRuns).where(eq(epgSyncRuns.sourceId, `iptv-org:${country}`)).orderBy(desc(epgSyncRuns.startedAt)).limit(1);
  }

  private async resolveMatch(program: NormalizedProgram): Promise<MatchResult | null> {
    const category = program.category?.toLowerCase() ?? "";
    const mediaType = /series|serial|episode/.test(category) ? "series" as const : /movie|film/.test(category) ? "movie" as const : null;
    if (!mediaType) return null;
    const normalizedTitle = `${this.provider.country ?? "RO"}:${normalizeEpgTitle(program.title)}:${program.year ?? "unknown"}`;
    const cached = (await this.db.select().from(epgTmdbMatches).where(and(eq(epgTmdbMatches.normalizedTitle, normalizedTitle), eq(epgTmdbMatches.mediaType, mediaType))).limit(1))[0];
    if (cached?.confidence && cached.confidence >= 0.72) return { mediaType: cached.mediaType, tmdbId: cached.tmdbId, confidence: cached.confidence, evidence: JSON.parse(cached.evidenceJson) as string[] };
    const candidates = await this.catalog.search({ query: program.title, region: this.provider.country ?? "RO" });
    const match = bestEpgMatch(program, candidates.filter((candidate) => candidate.mediaType === mediaType));
    if (!match) return null;
    await this.db.insert(epgTmdbMatches).values({ normalizedTitle, mediaType: match.mediaType, tmdbId: match.tmdbId, confidence: match.confidence, evidenceJson: JSON.stringify(match.evidence) })
      .onConflictDoUpdate({ target: [epgTmdbMatches.normalizedTitle, epgTmdbMatches.mediaType], set: { tmdbId: match.tmdbId, confidence: match.confidence, evidenceJson: JSON.stringify(match.evidence), updatedAt: new Date() } });
    return match;
  }
}
