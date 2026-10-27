import {and,eq,sql,desc,isNull,inArray} from 'drizzle-orm';
import {randomUUID} from 'node:crypto';
import {getDatabase,type NexDatabase} from '../db/client.js';
import {releaseSettings,releaseSubscriptions as subscriptions,releaseNotifications as notifications,profiles} from '../db/schema.js';
import {calendarDay,type Release,type ReleaseInfo} from '../domain/releases.js';
import type {TmdbRepository} from '../repositories/tmdb-repository.js';
import type {MediaType} from '../domain/types.js';

export function eligibleReleases(info:ReleaseInfo,kind:string,baseline:string[],today:string):Release[] {
  const oldest=new Date(`${today}T12:00:00Z`);oldest.setUTCDate(oldest.getUTCDate()-7);
  return info.releases.filter(r=>r.alertEligible!==false&&r.kind===kind&&r.date&&r.date<=today&&r.date>=oldest.toISOString().slice(0,10)&&!baseline.includes(r.key));
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
  async inbox(userId:string,country:string,offset=0,pending=false){
    const rows=await this.db.select().from(notifications).where(and(eq(notifications.userId,userId),eq(notifications.country,country),pending?and(isNull(notifications.popupAt),isNull(notifications.readAt)):undefined)).orderBy(desc(notifications.createdAt),desc(notifications.id)).limit(31).offset(offset);
    return {items:rows.slice(0,30),hasMore:rows.length>30};
  }
  async acknowledge(userId:string,ids:string[],kind:'read'|'popup'){
    if(!ids.length)return;
    await this.db.update(notifications).set(kind==='read'?{readAt:new Date()}:{popupAt:new Date()}).where(and(eq(notifications.userId,userId),inArray(notifications.id,ids)));
  }
  async sync(now=new Date(),limit=200){
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
    let checked=0,created=0,failed=0;
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
        for(const event of events){
          const body=event.kind==='season'?`Season ${event.season} premiered on ${event.date}.`:`${event.kind==='cinema'?'Cinema':'Digital'} release in ${s.country}: ${event.date}.`;
          // Atomic recheck after provider lookup; uniqueness prevents duplicate inbox
          // events on retries or concurrent runs. No external delivery service.
          const result=await this.db.run(sql`INSERT OR IGNORE INTO release_notifications
            (id,user_id,subscription_id,event_key,country,media_type,tmdb_id,title,body,release_date,created_at)
            SELECT ${randomUUID()},user_id,id,${event.key},country,media_type,tmdb_id,${info.title},${body},${event.date!},${+now}
            FROM release_subscriptions s WHERE s.id=${s.id} AND s.enabled=1
              AND EXISTS(SELECT 1 FROM profiles p WHERE p.user_id=s.user_id AND p.country=s.country)
              AND (s.kind!='season' OR (
                EXISTS(SELECT 1 FROM release_settings rs WHERE rs.user_id=s.user_id AND rs.follow_seen_series=1)
                AND EXISTS(SELECT 1 FROM watch_history h WHERE h.user_id=s.user_id AND h.media_type='series' AND h.tmdb_id=s.tmdb_id)))`);
          created+=result.rowsAffected;
        }
        await this.db.update(subscriptions).set({checkedAt:now}).where(eq(subscriptions.id,s.id));checked++;
      }catch{failed++;await this.db.update(subscriptions).set({checkedAt:now}).where(eq(subscriptions.id,s.id));}
    }
    // Inbox entries cascade with subscriptions and account deletion.
    return {checked,created,failed,atCapacity:rows.length===limit};
  }
}
