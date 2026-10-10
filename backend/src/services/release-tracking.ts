import {and,eq,gt,sql} from 'drizzle-orm';
import {randomUUID,createHash} from 'node:crypto';
import {getDatabase,type NexDatabase} from '../db/client.js';
import {releaseSettings,releaseSubscriptions as subscriptions,releaseDeliveries as deliveries,pushDevices,session,profiles} from '../db/schema.js';
import {calendarDay,type Release,type ReleaseInfo} from '../domain/releases.js';
import type {TmdbRepository} from '../repositories/tmdb-repository.js';
import type {MediaType} from '../domain/types.js';

export interface PushSender {send(token:string,title:string,body:string,data:Record<string,string>):Promise<'sent'|'invalid'>}
export function eligibleReleases(info:ReleaseInfo,kind:string,baseline:string[],today:string):Release[] {
  const oldest=new Date(`${today}T12:00:00Z`);oldest.setUTCDate(oldest.getUTCDate()-7);
  return info.releases.filter(r=>r.kind===kind&&r.date&&r.date<=today&&r.date>=oldest.toISOString().slice(0,10)&&!baseline.includes(r.key));
}
export class ReleaseTracking {
  constructor(private catalog:TmdbRepository,private db:NexDatabase=getDatabase()){}
  async list(userId:string){return this.db.select().from(subscriptions).where(eq(subscriptions.userId,userId));}
  async settings(userId:string){return (await this.db.select().from(releaseSettings).where(eq(releaseSettings.userId,userId)))[0]??{followSeenSeries:false};}
  async setAuto(userId:string,enabled:boolean){
    await this.db.insert(releaseSettings).values({userId,followSeenSeries:enabled}).onConflictDoUpdate({target:releaseSettings.userId,set:{followSeenSeries:enabled}});
  }
  async follow(userId:string,mediaType:MediaType,tmdbId:number,kind:'cinema'|'digital'|'season',country:string,enabled:boolean){
    if((mediaType==='series')!==(kind==='season'))throw new Error('INVALID_RELEASE_KIND');
    const match=and(eq(subscriptions.userId,userId),eq(subscriptions.mediaType,mediaType),eq(subscriptions.tmdbId,tmdbId),eq(subscriptions.kind,kind),eq(subscriptions.country,country));
    const existing=(await this.db.select().from(subscriptions).where(match))[0];
    if(!enabled){
      // Preserve a series opt-out so automatic Seen enrolment cannot turn it back on.
      await this.db.insert(subscriptions).values({id:randomUUID(),userId,mediaType,tmdbId,kind,country,enabled:false})
        .onConflictDoUpdate({target:[subscriptions.userId,subscriptions.mediaType,subscriptions.tmdbId,subscriptions.kind,subscriptions.country],set:{enabled:false}});
      return;
    }
    if(existing?.enabled)return;
    const info=await this.catalog.releases?.(mediaType,tmdbId,country);
    if(!info)throw new Error('RELEASE_DATA_UNAVAILABLE');
    const profile=(await this.db.select().from(profiles).where(eq(profiles.userId,userId)))[0];
    const today=calendarDay(new Date(),profile?.timezone);
    const baselineJson=JSON.stringify(info.releases.filter(r=>r.date&&r.date<=today).map(r=>r.key));
    await this.db.insert(subscriptions).values({id:randomUUID(),userId,mediaType,tmdbId,kind,country,enabled:true,baselineJson,initialized:true})
      .onConflictDoUpdate({target:[subscriptions.userId,subscriptions.mediaType,subscriptions.tmdbId,subscriptions.kind,subscriptions.country],set:{enabled:true,baselineJson,initialized:true,createdAt:new Date()}});
  }
  async register(userId:string,sessionId:string,token:string){
    const owned=(await this.db.select().from(session).where(and(eq(session.id,sessionId),eq(session.userId,userId),gt(session.expiresAt,new Date()))))[0];
    if(!owned)throw new Error('UNAUTHORIZED');
    // An app installation has one active account; signing in replaces its association.
    await this.db.insert(pushDevices).values({token,userId,sessionId}).onConflictDoUpdate({target:pushDevices.token,set:{userId,sessionId,updatedAt:new Date()}});
  }
  async unregister(userId:string,token:string){await this.db.delete(pushDevices).where(and(eq(pushDevices.userId,userId),eq(pushDevices.token,token)));}
  async sync(sender:PushSender,now=new Date(),limit=200){
    // Set-based insertion, no title calls per history row, and never override opt-outs.
    await this.db.run(sql`INSERT OR IGNORE INTO release_subscriptions
      (id,user_id,media_type,tmdb_id,kind,country,enabled,baseline_json,initialized,created_at,checked_at)
      SELECT lower(hex(randomblob(16))),h.user_id,'series',h.tmdb_id,'season',p.country,1,'[]',0,${+now},0
      FROM watch_history h JOIN release_settings s ON s.user_id=h.user_id JOIN profiles p ON p.user_id=h.user_id
      WHERE h.media_type='series' AND s.follow_seen_series=1`);
    const rows=await this.db.select({subscription:subscriptions,timezone:profiles.timezone}).from(subscriptions)
      .innerJoin(profiles,and(eq(profiles.userId,subscriptions.userId),eq(profiles.country,subscriptions.country)))
      .where(and(eq(subscriptions.enabled,true),sql`(${subscriptions.kind}!='season' OR (EXISTS(SELECT 1 FROM release_settings rs WHERE rs.user_id=${subscriptions.userId} AND rs.follow_seen_series=1) AND EXISTS(SELECT 1 FROM watch_history h WHERE h.user_id=${subscriptions.userId} AND h.media_type='series' AND h.tmdb_id=${subscriptions.tmdbId})))`))
      .orderBy(subscriptions.checkedAt,subscriptions.id).limit(limit);
    const cache=new Map<string,Promise<ReleaseInfo|undefined>>();
    let checked=0,sent=0,failed=0;
    for(const {subscription:s,timezone} of rows){
      try{
        const key=`${s.mediaType}:${s.tmdbId}:${s.country}`;
        if(!cache.has(key))cache.set(key,this.catalog.releases?.(s.mediaType,s.tmdbId,s.country)??Promise.resolve(undefined));
        const info=await cache.get(key);if(!info)throw new Error('RELEASE_DATA_UNAVAILABLE');
        const today=calendarDay(now,timezone);
        if(!s.initialized){
          await this.db.update(subscriptions).set({initialized:true,baselineJson:JSON.stringify(info.releases.filter(r=>r.date&&r.date<=today).map(r=>r.key)),checkedAt:now}).where(eq(subscriptions.id,s.id));
          checked++;continue;
        }
        const events=eligibleReleases(info,s.kind,JSON.parse(s.baselineJson) as string[],today);
        const devices=await this.db.select({token:pushDevices.token,sessionId:pushDevices.sessionId}).from(pushDevices).innerJoin(session,and(eq(session.id,pushDevices.sessionId),gt(session.expiresAt,now))).where(eq(pushDevices.userId,s.userId));
        for(const event of events)for(const device of devices){
          const hash=createHash('sha256').update(device.token).digest('hex');
          const identity=and(eq(deliveries.subscriptionId,s.id),eq(deliveries.eventKey,event.key),eq(deliveries.tokenHash,hash));
          const previous=(await this.db.select().from(deliveries).where(identity))[0];
          if(previous?.sent||previous&&+now-+previous.attemptAt<15*60_000)continue;
          const id=previous?.id??randomUUID();
          if(previous){
            const claimed=await this.db.update(deliveries).set({attemptAt:now}).where(and(identity,eq(deliveries.sent,false),eq(deliveries.attemptAt,previous.attemptAt))).returning();
            if(!claimed.length)continue;
          }else{
            const claimed=await this.db.insert(deliveries).values({id,subscriptionId:s.id,eventKey:event.key,tokenHash:hash,attemptAt:now}).onConflictDoNothing().returning();
            if(!claimed.length)continue;
          }
          // Recheck opt-out/session after slow provider requests, before external delivery.
          const active=(await this.db.select().from(subscriptions).where(and(eq(subscriptions.id,s.id),eq(subscriptions.enabled,true))))[0];
          const current=(await this.db.select().from(session).where(and(eq(session.id,device.sessionId),eq(session.userId,s.userId),gt(session.expiresAt,now))))[0];
          const registered=(await this.db.select().from(pushDevices).where(and(eq(pushDevices.token,device.token),eq(pushDevices.userId,s.userId),eq(pushDevices.sessionId,device.sessionId))))[0];
          const settings=s.kind==='season'?await this.settings(s.userId):null;
          if(!active||!current||!registered||settings&&!settings.followSeenSeries)continue;
          const body=event.kind==='season'?`Season ${event.season} premiered on ${event.date}.`:`${event.kind==='cinema'?'Cinema':'Digital'} release in ${s.country}: ${event.date}.`;
          const result=await sender.send(device.token,info.title,body,{eventId:id,mediaType:s.mediaType,tmdbId:String(s.tmdbId)});
          if(result==='invalid')await this.unregister(s.userId,device.token);
          await this.db.update(deliveries).set({sent:true}).where(eq(deliveries.id,id));
          if(result==='sent')sent++;
        }
        await this.db.update(subscriptions).set({checkedAt:now}).where(eq(subscriptions.id,s.id));checked++;
      }catch{failed++;await this.db.update(subscriptions).set({checkedAt:now}).where(eq(subscriptions.id,s.id));}
    }
    // Keep dedup records only while their subscription exists. Tokens expire with sessions.
    return {checked,sent,failed,atCapacity:rows.length===limit};
  }
}
