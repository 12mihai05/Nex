import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, lt, sql, inArray } from "drizzle-orm";
import type { NexDatabase } from "../db/client.js";
import { getDatabase } from "../db/client.js";
import {
  aiUsage, conversationDisplayedItems, conversationMessages, conversationSessions, epgPrograms, profiles, reminders,
  sessionContext, userEvents, userLanguagePreferences, userStreamingServices, userTastePreferences, userTitleFeedback,
  watchHistory, watchlist, channels,
} from "../db/schema.js";
import type { ContentItem, TasteSignal, ChatBlock } from "../domain/types.js";
import type {ChatActionPlan} from '../services/chat-action-types.js';
import { calculateReminderTime } from "../services/reminder.js";
import { aggregateEvidence, evidenceWeight, signalStrength, titleDimensions, type TasteEvidence } from "../services/taste.js";
import type { RankedContent } from "../domain/types.js";

export interface SettingsInput {
  country?: string | undefined;
  timezone?: string | undefined;
  appearance?: "system" | "light" | "dark" | undefined;
  behaviorPersonalization?: boolean | undefined;
  remindersEnabled?: boolean | undefined;
  onboardingComplete?: boolean | undefined;
}

export class UserRepository {
  constructor(private readonly db: Pick<NexDatabase,"select"|"insert"|"update"|"delete"|"transaction"> = getDatabase()) {}

  async ensureProfile(userId: string): Promise<void> {
    await this.db.insert(profiles).values({ userId }).onConflictDoNothing();
  }

  async getSettings(userId: string) {
    let profile = (await this.db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1))[0];
    if(!profile){await this.ensureProfile(userId);profile=(await this.db.select().from(profiles).where(eq(profiles.userId,userId)).limit(1))[0]!;}
    const services = await this.db.select().from(userStreamingServices).where(eq(userStreamingServices.userId, userId));
    const languages = await this.db.select().from(userLanguagePreferences).where(eq(userLanguagePreferences.userId, userId));
    return { profile, services, languages };
  }

  async updateSettings(userId: string, input: SettingsInput): Promise<void> {
    await this.ensureProfile(userId);
    await this.db.update(profiles).set({ ...input, updatedAt: new Date() }).where(eq(profiles.userId, userId));
    if (input.remindersEnabled === false) await this.db.update(reminders).set({active:false,updatedAt:new Date()}).where(eq(reminders.userId,userId));
  }

  async replaceServices(userId: string, services: Array<{ providerId: number; providerName: string; logoPath?: string | null | undefined }>): Promise<void> {
    await this.db.delete(userStreamingServices).where(eq(userStreamingServices.userId, userId));
    if (services.length) await this.db.insert(userStreamingServices).values(services.map((service) => ({ userId, providerId: service.providerId, providerName: service.providerName, logoPath: service.logoPath ?? null })));
  }

  async replaceLanguages(userId: string, audio: string[], subtitles: string[], preferOriginal: boolean): Promise<void> {
    await this.db.delete(userLanguagePreferences).where(eq(userLanguagePreferences.userId, userId));
    const rows = [
      ...audio.map((languageCode) => ({ userId, kind: "audio" as const, languageCode, preferOriginal })),
      ...subtitles.map((languageCode) => ({ userId, kind: "subtitle" as const, languageCode, preferOriginal: false })),
    ];
    if (rows.length) await this.db.insert(userLanguagePreferences).values(rows);
  }

  async getTaste(userId: string): Promise<TasteSignal[]> {
    return (await this.db.select().from(userTastePreferences).where(eq(userTastePreferences.userId, userId))).flatMap((row) => {
      const original = JSON.parse(row.evidenceJson) as TasteEvidence[];
      const entries = original.filter(e=>e.source!=="watchlist");
      if(!entries.length&&(original.length||row.source==="watchlist"))return [];
      return entries.length ? aggregateEvidence(row.dimension, row.key, entries) : { dimension: row.dimension, key: row.key, score: row.score, confidence: row.confidence, evidenceCount: row.evidenceCount, source: row.source, explicit: row.explicit, sources: [row.source], updatedAt: row.updatedAt.toISOString() };
    });
  }

  async upsertTaste(userId: string, signals: TasteSignal[], evidenceId?: string): Promise<void> {
    for (const original of signals) {
      const signal = { ...original };
      let key = signal.key.trim().toLowerCase();
      if (["sci-fi","scifi"].includes(key)) key="science fiction";
      if (key === "musicals") key="musical";
      if (signal.dimension === "theme" || (signal.dimension === "genre" && key === "musical")) signal.dimension="keyword";
      const existing = (await this.db.select().from(userTastePreferences).where(and(eq(userTastePreferences.userId,userId),eq(userTastePreferences.dimension,signal.dimension),eq(userTastePreferences.key,key))).limit(1))[0];
      let entries: TasteEvidence[] = existing ? JSON.parse(existing.evidenceJson) as TasteEvidence[] : [];
      if (existing && !entries.length) entries = [{ id: "legacy", source: existing.source, score: existing.score, weight: Math.max(.1,existing.confidence), explicit: /explicit|onboarding/.test(existing.source), at: existing.updatedAt.toISOString() }];
      const id = evidenceId ?? signal.source;
      entries = entries.filter((e) => e.id !== id);
      entries.push({ id, source: signal.source, score: signal.score, weight: evidenceWeight(signal.source)*(evidenceId?signal.confidence:1), explicit: !["watchlist","search","detail_open"].includes(signal.source), at: new Date().toISOString() });
      entries = entries.slice(-64);
      const merged = aggregateEvidence(signal.dimension,key,entries);
      const values = { dimension: signal.dimension, key, score: merged.score, confidence: merged.confidence, evidenceCount: merged.evidenceCount, source: merged.source, explicit: merged.explicit ?? false, evidenceJson: JSON.stringify(entries), lastEvidenceAt: new Date(), updatedAt: new Date() };
      await this.db.insert(userTastePreferences).values({ id: randomUUID(), userId, ...values }).onConflictDoUpdate({ target: [userTastePreferences.userId,userTastePreferences.dimension,userTastePreferences.key], set: values });
    }
  }

  async learnFromTitle(userId: string, item: ContentItem, source: keyof typeof signalStrength | "onboarding_favorite") {
    if (source === "watched" || source === "watchlist") return;
    if (["super_like","like","meh","dislike","onboarding_favorite"].includes(source)) {
      await this.removeReactionEvidence(userId,item.mediaType,item.id,true);
      if(source === "meh") return;
    }
    if (["watchlist","search","detail_open"].includes(source) && !(await this.getSettings(userId)).profile.behaviorPersonalization) return;
    const score = source === "onboarding_favorite" ? .8 : signalStrength[source];
    const reliability:Record<string,number>={genre:.75,keyword:.5,mood:.5,director:.3,actor:.2,language:.1,decade:.1,format:.1,country:.1,franchise:.5};
    await this.upsertTaste(userId,titleDimensions(item).map((d)=>({ ...d, score, confidence: reliability[d.dimension] ?? .1, evidenceCount: 1, source })), `reaction:${item.mediaType}:${item.id}`);
  }

  async clearTaste(userId: string): Promise<void> {
    await this.db.delete(userTastePreferences).where(eq(userTastePreferences.userId, userId));
  }

  async listWatchlist(userId: string) {
    return this.db.select().from(watchlist).where(eq(watchlist.userId, userId)).orderBy(desc(watchlist.createdAt));
  }

  async addWatchlist(userId: string, item: Pick<ContentItem, "id" | "mediaType" | "title" | "posterUrl"> & Partial<ContentItem>): Promise<void> {
    const traitsJson=JSON.stringify([...(item.genres??[]).map(key=>({dimension:"genre",key:key.toLowerCase()})),...(item.keywords??[]).slice(0,12).map(key=>({dimension:"keyword",key:key.toLowerCase()}))]);
    await this.db.insert(watchlist).values({ userId, tmdbId: item.id, mediaType: item.mediaType, titleSnapshot: item.title, posterPath: item.posterUrl,traitsJson }).onConflictDoUpdate({target:[watchlist.userId,watchlist.mediaType,watchlist.tmdbId],set:{traitsJson,titleSnapshot:item.title,posterPath:item.posterUrl}});
    await this.addEvent(userId, "watchlist_add", item.mediaType, item.id, 0.42);
  }

  async removeWatchlist(userId: string, mediaType: "movie" | "series", tmdbId: number): Promise<void> {
    await this.db.delete(watchlist).where(and(eq(watchlist.userId, userId), eq(watchlist.mediaType, mediaType), eq(watchlist.tmdbId, tmdbId)));
  }

  async listHistory(userId: string) {
    return this.db.select().from(watchHistory).where(eq(watchHistory.userId, userId)).orderBy(desc(watchHistory.watchedAt));
  }

  async removeWatched(userId: string, mediaType: "movie" | "series", tmdbId: number): Promise<void> {
    await this.db.delete(watchHistory).where(and(eq(watchHistory.userId,userId),eq(watchHistory.mediaType,mediaType),eq(watchHistory.tmdbId,tmdbId)));
  }

  async listFeedback(userId: string) {
    return this.db.select().from(userTitleFeedback).where(eq(userTitleFeedback.userId,userId));
  }

  private async removeReactionEvidence(userId: string, mediaType: string, tmdbId: number, includeWatchlist=false) {
    const evidenceId=`reaction:${mediaType}:${tmdbId}`;
    const rows=await this.db.select().from(userTastePreferences).where(eq(userTastePreferences.userId,userId));
    for(const row of rows){
      const old=JSON.parse(row.evidenceJson) as TasteEvidence[];
      const entries=old.filter(e=>e.id!==evidenceId&&(!includeWatchlist||e.id!==`watchlist:${mediaType}:${tmdbId}`));
      if(entries.length===old.length)continue;
      if(!entries.length){await this.db.delete(userTastePreferences).where(and(eq(userTastePreferences.userId,userId),eq(userTastePreferences.id,row.id)));continue;}
      const merged=aggregateEvidence(row.dimension,row.key,entries);
      await this.db.update(userTastePreferences).set({score:merged.score,confidence:merged.confidence,evidenceCount:merged.evidenceCount,source:merged.source,explicit:merged.explicit??false,evidenceJson:JSON.stringify(entries),updatedAt:new Date()}).where(and(eq(userTastePreferences.userId,userId),eq(userTastePreferences.id,row.id)));
    }
  }

  async clearFeedback(userId: string, mediaType: "movie" | "series", tmdbId: number) {
    await this.db.transaction(async tx=>{
      await tx.delete(userTitleFeedback).where(and(eq(userTitleFeedback.userId,userId),eq(userTitleFeedback.mediaType,mediaType),eq(userTitleFeedback.tmdbId,tmdbId)));
      await new UserRepository(tx).removeReactionEvidence(userId,mediaType,tmdbId);
    });
  }

  async applyFeedback(userId: string,item: ContentItem,reaction:"like"|"super_like"|"meh"|"dislike") {
    await this.db.transaction(async tx=>{
      const scoped=new UserRepository(tx);
      await scoped.setFeedback(userId,item.mediaType,item.id,reaction);
      await scoped.learnFromTitle(userId,item,reaction);
    });
  }

  async markWatched(userId: string, item: Pick<ContentItem, "id" | "mediaType" | "title"> & Partial<ContentItem>, watchedAt = new Date()): Promise<void> {
    const traits=[...(item.genres??[]).map(key=>({dimension:"genre",key:key.toLowerCase()})),...(item.keywords??[]).slice(0,12).map(key=>({dimension:"keyword",key:key.toLowerCase()}))];
    const traitsJson=JSON.stringify(traits);
    await this.db.insert(watchHistory).values({ id: randomUUID(), userId, mediaType: item.mediaType, tmdbId: item.id, titleSnapshot: item.title, traitsJson, watchedAt })
      .onConflictDoUpdate({ target: [watchHistory.userId, watchHistory.mediaType, watchHistory.tmdbId], set: { watchedAt, titleSnapshot: item.title,traitsJson } });
    await this.addEvent(userId, "watched", item.mediaType, item.id, 0);
  }

  async setFeedback(userId: string, mediaType: "movie" | "series", tmdbId: number, reaction: "super_like" | "like" | "meh" | "dislike"): Promise<void> {
    await this.db.insert(userTitleFeedback).values({ userId, mediaType, tmdbId, reaction }).onConflictDoUpdate({ target: [userTitleFeedback.userId, userTitleFeedback.mediaType, userTitleFeedback.tmdbId], set: { reaction, updatedAt: new Date() } });
    const strength = signalStrength[reaction];
    await this.addEvent(userId, reaction, mediaType, tmdbId, strength);
  }

  async getRecommendationState(userId: string) {
    const [settings, taste, history, saved, feedback, events] = await Promise.all([this.getSettings(userId), this.getTaste(userId), this.listHistory(userId), this.listWatchlist(userId), this.db.select().from(userTitleFeedback).where(eq(userTitleFeedback.userId,userId)), this.db.select().from(userEvents).where(and(eq(userEvents.userId,userId),gt(userEvents.createdAt,new Date(Date.now()-30*86_400_000)))).orderBy(desc(userEvents.createdAt)).limit(500)]);
    const rated=new Set(feedback.map(r=>`${r.mediaType}:${r.tmdbId}`));
    return {
      country: settings.profile.country,
      timezone: settings.profile.timezone,
      ownedProviderIds: settings.services.map((row) => row.providerId), taste,
      watchedIds: new Set(history.map((row) => row.tmdbId)), watchlistIds: new Set(saved.map((row) => row.tmdbId)),
      watchedKeys: new Set(history.map((r)=>`${r.mediaType}:${r.tmdbId}`)), watchlistKeys: new Set(saved.map((r)=>`${r.mediaType}:${r.tmdbId}`)),
      ratedKeys: new Set(feedback.map(r=>`${r.mediaType}:${r.tmdbId}`)),
      wantHints: settings.profile.behaviorPersonalization ? saved.filter(h=>!rated.has(`${h.mediaType}:${h.tmdbId}`)).flatMap(h=>JSON.parse(h.traitsJson) as Array<{dimension:string;key:string}>) : [],
      behaviorPersonalization: settings.profile.behaviorPersonalization,
      // Kept separate from durable declared taste: history is not an explicit Like.
      seenHints: settings.profile.behaviorPersonalization ? history.filter(h=>!feedback.some(f=>f.mediaType===h.mediaType&&f.tmdbId===h.tmdbId)).flatMap(h=>JSON.parse(h.traitsJson) as Array<{dimension:string;key:string}>) : [],
      rejectedKeys: new Set([...feedback.filter((r)=>r.reaction === "dislike").map((r)=>`${r.mediaType}:${r.tmdbId}`), ...events.filter((r)=>r.eventType === "rejected" && +r.createdAt > Date.now()-7*86_400_000).map((r)=>`${r.mediaType}:${r.tmdbId}`)]),
      recentlyShown: new Map(events.filter((r)=>r.eventType === "shown").reverse().map((r)=>[`${r.mediaType}:${r.tmdbId}`, +r.createdAt])),
      favorites: feedback.filter((r)=>r.reaction === "super_like" || r.reaction === "like"), saved,
    };
  }

  async recordRecommendations(userId: string, ranked: RankedContent[], context: string): Promise<void> {
    if (ranked.length) await this.db.insert(userEvents).values(ranked.map((r,index)=>({ id: randomUUID(), userId, eventType: "shown", mediaType: r.item.mediaType, tmdbId: r.item.id, strength: 0, metadataJson: JSON.stringify({ context, rank: index+1, evidence: r.evidence, score: r.score }) })));
    await this.db.delete(userEvents).where(and(eq(userEvents.userId,userId),lt(userEvents.createdAt,new Date(Date.now()-90*86_400_000))));
  }

  async rejectTitle(userId: string, mediaType: string, tmdbId: number) { await this.addEvent(userId,"rejected",mediaType,tmdbId,0); }

  async getSessionContext(userId: string, conversationSessionId: string) {
    if (!await this.assertConversation(userId,conversationSessionId)) throw new Error("CONVERSATION_NOT_FOUND");
    const row = (await this.db.select().from(sessionContext).where(and(eq(sessionContext.userId,userId),eq(sessionContext.conversationSessionId,conversationSessionId),gt(sessionContext.expiresAt,new Date()))).limit(1))[0];
    return row ? JSON.parse(row.contextJson) as Record<string,unknown> : {};
  }

  async commitChatPlan(userId:string,sessionId:string,planId:string|undefined,cancel=false):Promise<ChatBlock[]>{
    return this.db.transaction(async tx=>{
      const repo=new UserRepository(tx);
      const context=await repo.getSessionContext(userId,sessionId);
      const receipt=context.chatReceipt as {id:string;blocks:ChatBlock[]}|undefined;
      if(planId&&receipt?.id===planId){
        for(const block of receipt.blocks){
          if(block.type==='confirmation'&&block.action?.type==='setReminder'){
            const action=block.action;
            const existing=(await repo.listReminders(userId)).find(r=>r.id===action.id);
            if(!existing||!existing.active||existing.title!==action.title||existing.channelName!==action.channelName||existing.offsetMinutes!==action.offsetMinutes||existing.startsAt.toISOString()!==action.startsAt||+existing.notifyAt<=Date.now())throw new Error('REMINDER_RECEIPT_STALE');
          }
        }
        return receipt.blocks;
      }
      const plan=context.chatPlan as ChatActionPlan|undefined;
      if(!plan||plan.expiresAt<Date.now()||(planId&&plan.id!==planId))throw new Error('CHAT_PLAN_EXPIRED');
      if(cancel){delete context.chatPlan;await repo.setSessionContext(userId,sessionId,context);return [{type:'text',content:'Cancelled. Nothing changed.'}];}
      const blocks:ChatBlock[]=[];
      if(plan.reminder){
        const expected=plan.reminder;
        const current=(await tx.select({startAt:epgPrograms.startAt,title:epgPrograms.title,channelName:channels.displayName,country:channels.country,active:channels.active})
          .from(epgPrograms).innerJoin(channels,eq(channels.id,epgPrograms.channelId)).where(eq(epgPrograms.id,expected.id)).limit(1))[0];
        if(!current||!current.active||current.country!==plan.country||current.startAt.toISOString()!==expected.startAt||current.title!==expected.title||current.channelName!==expected.channelName)throw new Error('EPG_CHANGED');
        const r=await repo.createReminder(userId,expected.id,expected.offsetMinutes);
        blocks.push({type:'confirmation',content:`Reminder saved for ${r.title} on ${r.channelName}; your device must confirm notification scheduling.`,
          action:{type:'setReminder',id:r.id,epgProgramId:r.epgProgramId,title:r.title,channelName:r.channelName,startsAt:r.startsAt.toISOString(),offsetMinutes:r.offsetMinutes}});
      }else{
        if(!plan.entries.length||plan.entries.length>50)throw new Error('INVALID_CHAT_PLAN');
        // Each operation and its taste evidence are committed with the receipt.
        // Cache taste rows once for the entire list, not once per title/trait.
        const opinions=plan.entries.filter(e=>e.change.rating!=='keep');
        const tasteRows=opinions.length?await tx.select().from(userTastePreferences).where(eq(userTastePreferences.userId,userId)):[];
        const taste=new Map<string,{dimension:string;key:string;entries:TasteEvidence[];row?:typeof userTastePreferences.$inferSelect}>(tasteRows.map(r=>[`${r.dimension}:${r.key}`,{dimension:r.dimension,key:r.key,entries:JSON.parse(r.evidenceJson) as TasteEvidence[],row:r}]));
        const touched=new Set<string>();const now=new Date();
        for(const {item,change} of plan.entries){
          if(change.watchlist==='add')await repo.addWatchlist(userId,item);
          if(change.watchlist==='remove')await repo.removeWatchlist(userId,item.mediaType,item.id);
          if(change.seen==='seen')await repo.markWatched(userId,item);
          if(change.seen==='unseen')await repo.removeWatched(userId,item.mediaType,item.id);
          if(change.rating==='keep')continue;
          if(change.rating==='clear')await tx.delete(userTitleFeedback).where(and(eq(userTitleFeedback.userId,userId),eq(userTitleFeedback.mediaType,item.mediaType),eq(userTitleFeedback.tmdbId,item.id)));
          else await repo.setFeedback(userId,item.mediaType,item.id,change.rating);
          const evidenceId=`reaction:${item.mediaType}:${item.id}`;
          for(const [key,value] of taste){const filtered=value.entries.filter(e=>e.id!==evidenceId&&e.id!==`watchlist:${item.mediaType}:${item.id}`);
            if(filtered.length!==value.entries.length){value.entries=filtered;touched.add(key);}}
          if(change.rating==='clear'||change.rating==='meh')continue;
          const reliability:Record<string,number>={genre:.75,keyword:.5,mood:.5,director:.3,actor:.2,language:.1,decade:.1,format:.1,country:.1,franchise:.5};
          for(const d of titleDimensions(item)){
            let key=d.key.trim().toLowerCase();let dimension=d.dimension;
            if(['sci-fi','scifi'].includes(key))key='science fiction';if(key==='musicals')key='musical';
            if(dimension==='theme'||dimension==='genre'&&key==='musical')dimension='keyword';
            const mapKey=`${dimension}:${key}`;let value=taste.get(mapKey);
            if(!value){value={dimension,key,entries:[]};taste.set(mapKey,value);}
            if(value.row&&!value.entries.length&&!touched.has(mapKey))value.entries=[{id:'legacy',source:value.row.source,score:value.row.score,weight:Math.max(.1,value.row.confidence),explicit:/explicit|onboarding/.test(value.row.source),at:value.row.updatedAt.toISOString()}];
            value.entries=value.entries.filter(e=>e.id!==evidenceId);
            value.entries.push({id:evidenceId,source:change.rating,score:signalStrength[change.rating],weight:evidenceWeight(change.rating)*(reliability[dimension]??.1),explicit:true,at:now.toISOString()});
            value.entries=value.entries.slice(-64);touched.add(mapKey);
          }
        }
        const upserts=[];
        for(const key of touched){const value=taste.get(key)!;
          if(!value.entries.length){await tx.delete(userTastePreferences).where(and(eq(userTastePreferences.userId,userId),eq(userTastePreferences.dimension,value.dimension),eq(userTastePreferences.key,value.key)));continue;}
          const merged=aggregateEvidence(value.dimension,value.key,value.entries);
          upserts.push({id:randomUUID(),userId,dimension:value.dimension,key:value.key,score:merged.score,confidence:merged.confidence,evidenceCount:merged.evidenceCount,source:merged.source,explicit:merged.explicit??false,evidenceJson:JSON.stringify(value.entries),lastEvidenceAt:now,updatedAt:now});
        }
        for(let i=0;i<upserts.length;i+=20)await tx.insert(userTastePreferences).values(upserts.slice(i,i+20)).onConflictDoUpdate({target:[userTastePreferences.userId,userTastePreferences.dimension,userTastePreferences.key],set:{score:sql`excluded.score`,confidence:sql`excluded.confidence`,evidenceCount:sql`excluded.evidence_count`,source:sql`excluded.source`,explicit:sql`excluded.explicit`,evidenceJson:sql`excluded.evidence_json`,lastEvidenceAt:now,updatedAt:now}});
        blocks.push({type:'confirmation',content:`Saved ${plan.entries.length} of ${plan.entries.length} titles.\n${plan.summary}\nAll other flags and ratings were left unchanged.`});
        blocks.push({type:'library_changes',status:'saved',items:plan.entries.map(({item,change})=>({id:item.id,mediaType:item.mediaType,title:item.title,year:item.year,posterUrl:item.posterUrl,
          changes:[change.watchlist==='add'?'Added to Want to see':change.watchlist==='remove'?'Removed from Want to see':null,change.seen==='seen'?'Marked Seen':change.seen==='unseen'?'Seen mark removed':null,change.rating==='keep'?null:change.rating==='clear'?'Rating cleared':`Rated ${change.rating.replace('_',' ')}`].filter((s):s is string=>s!==null)}))});
      }
      delete context.chatPlan;
      context.chatReceipt={id:plan.id,blocks};
      await repo.setSessionContext(userId,sessionId,context);
      return blocks;
    });
  }

  async createReminder(userId: string, epgProgramId: string, offsetMinutes: number) {
    if (!(await this.getSettings(userId)).profile.remindersEnabled) throw new Error("REMINDERS_DISABLED");
    const program = (await this.db.select().from(epgPrograms).where(eq(epgPrograms.id, epgProgramId)).limit(1))[0];
    if (!program) throw new Error("EPG_PROGRAM_NOT_FOUND");
    const notifyAt = calculateReminderTime(program.startAt, offsetMinutes);
    if (notifyAt <= new Date()) throw new Error("REMINDER_TIME_PASSED");
    const id = randomUUID();
    await this.db.insert(reminders).values({ id, userId, epgProgramId, offsetMinutes, notifyAt }).onConflictDoUpdate({ target: [reminders.userId, reminders.epgProgramId], set: { offsetMinutes, notifyAt, active: true, updatedAt: new Date() } });
    const saved = (await this.db.select().from(reminders).where(and(eq(reminders.userId,userId),eq(reminders.epgProgramId,epgProgramId))).limit(1))[0]!;
    const channel=(await this.db.select().from(channels).where(eq(channels.id,program.channelId)).limit(1))[0];
    return { id: saved.id, epgProgramId, title: program.title, channelName:channel?.displayName??null, startsAt: program.startAt, notifyAt, offsetMinutes };
  }

  async listReminders(userId: string) {
    return this.db.select({ id: reminders.id, epgProgramId: reminders.epgProgramId, notifyAt: reminders.notifyAt, offsetMinutes: reminders.offsetMinutes, active: reminders.active, title: epgPrograms.title, channelName:channels.displayName, startsAt: epgPrograms.startAt })
      .from(reminders).innerJoin(epgPrograms, eq(reminders.epgProgramId, epgPrograms.id)).leftJoin(channels,eq(channels.id,epgPrograms.channelId)).where(eq(reminders.userId, userId)).orderBy(reminders.notifyAt);
  }

  async deleteReminder(userId: string, id: string): Promise<boolean> {
    const deleted = await this.db.delete(reminders).where(and(eq(reminders.userId, userId), eq(reminders.id, id))).returning({ id: reminders.id });
    return deleted.length > 0;
  }

  async createConversation(userId: string): Promise<string> {
    const id = randomUUID();
    await this.db.insert(conversationSessions).values({ id, userId });
    return id;
  }

  async assertConversation(userId: string, sessionId: string): Promise<boolean> {
    const row = await this.db.select({ id: conversationSessions.id }).from(conversationSessions).where(and(eq(conversationSessions.id, sessionId), eq(conversationSessions.userId, userId))).limit(1);
    return row.length === 1;
  }

  async addConversationMessage(userId: string, sessionId: string, role: "user" | "assistant", content: string, blocks?: unknown): Promise<string> {
    if (!await this.assertConversation(userId, sessionId)) throw new Error("CONVERSATION_NOT_FOUND");
    const id = randomUUID();
    await this.db.insert(conversationMessages).values({ id, sessionId, role, content, blocksJson: blocks ? JSON.stringify(blocks) : null });
    await this.db.update(conversationSessions).set({ updatedAt: new Date() }).where(and(eq(conversationSessions.id, sessionId), eq(conversationSessions.userId, userId)));
    return id;
  }

  async saveDisplayedItems(userId: string, sessionId: string, messageId: string, items: ContentItem[]): Promise<void> {
    if (!await this.assertConversation(userId, sessionId)) throw new Error("CONVERSATION_NOT_FOUND");
    if (items.length) await this.db.insert(conversationDisplayedItems).values(items.map((item, index) => ({ id: randomUUID(), sessionId, messageId, position: index + 1, contentType: item.mediaType, externalId: String(item.id), metadataJson: JSON.stringify({ title: item.title }) })));
  }

  async saveDisplayedReferences(userId: string, sessionId: string, messageId: string, items: Array<{ contentType: "movie" | "series" | "episode" | "liveEvent"; externalId: string; metadata?: Record<string, unknown> }>): Promise<void> {
    if (!await this.assertConversation(userId, sessionId)) throw new Error("CONVERSATION_NOT_FOUND");
    if (items.length) await this.db.insert(conversationDisplayedItems).values(items.map((item, index) => ({ id: randomUUID(), sessionId, messageId, position: index + 1, contentType: item.contentType, externalId: item.externalId, metadataJson: item.metadata ? JSON.stringify(item.metadata) : null })));
  }

  async recentDisplayedItems(userId: string, sessionId: string) {
    if (!await this.assertConversation(userId, sessionId)) throw new Error("CONVERSATION_NOT_FOUND");
    const rows = await this.db.select().from(conversationDisplayedItems).where(eq(conversationDisplayedItems.sessionId, sessionId)).orderBy(desc(conversationDisplayedItems.createdAt)).limit(12);
    const latestMessage = rows[0]?.messageId;
    return rows.filter((row) => row.messageId === latestMessage).sort((a, b) => a.position - b.position);
  }

  async setSessionContext(userId: string, conversationSessionId: string, value: Record<string, unknown>, ttlHours = 12): Promise<void> {
    if (!await this.assertConversation(userId, conversationSessionId)) throw new Error("CONVERSATION_NOT_FOUND");
    await this.db.insert(sessionContext).values({ conversationSessionId, userId, contextJson: JSON.stringify(value), expiresAt: new Date(Date.now() + ttlHours * 3_600_000) })
      .onConflictDoUpdate({ target: sessionContext.conversationSessionId, set: { contextJson: JSON.stringify(value), expiresAt: new Date(Date.now() + ttlHours * 3_600_000), updatedAt: new Date() } });
  }

  async incrementAiUsage(userId: string, dailyLimit: number, now = new Date()): Promise<boolean> {
    const date = now.toISOString().slice(0, 10);
    await this.db.insert(aiUsage).values({ userId, usageDate: date, messageCount: 0 }).onConflictDoNothing();
    const changed = await this.db.update(aiUsage).set({ messageCount: sql`${aiUsage.messageCount} + 1`, updatedAt: now }).where(and(eq(aiUsage.userId,userId),eq(aiUsage.usageDate,date),lt(aiUsage.messageCount,dailyLimit))).returning({ count: aiUsage.messageCount });
    return changed.length === 1;
  }

  async idsInWatchlist(userId: string, ids: number[]): Promise<Set<number>> {
    if (!ids.length) return new Set();
    const rows = await this.db.select({ id: watchlist.tmdbId }).from(watchlist).where(and(eq(watchlist.userId, userId), inArray(watchlist.tmdbId, ids)));
    return new Set(rows.map((row) => row.id));
  }

  private async addEvent(userId: string, eventType: string, mediaType: string, tmdbId: number, strength: number): Promise<void> {
    await this.db.insert(userEvents).values({ id: randomUUID(), userId, eventType, mediaType, tmdbId, strength });
  }
}
