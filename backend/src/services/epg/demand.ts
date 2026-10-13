import {and,eq,gt,sql} from 'drizzle-orm';
import {getDatabase,type NexDatabase} from '../../db/client.js';
import {channels,epgPrograms,epgCountryDemand,epgSyncRuns,epgTmdbMatches} from '../../db/schema.js';
import {getConfig} from '../../config.js';

const DAY=86_400_000;
export class EpgDemand {
  constructor(private readonly db:NexDatabase=getDatabase()){}
  async countries(now=new Date()):Promise<string[]>{
    const rows=await this.db.all<{country:string}>(sql`select country from epg_country_demand d
      where exists(select 1 from profiles p where p.country=d.country)
      or (ever_selected=1 and inactive_since>${+now-14*DAY})`);
    const enabled=new Set(getConfig().EPG_COUNTRIES.split(',').map(c=>c.trim()));
    return rows.map(r=>r.country).filter(c=>enabled.has(c));
  }
  async status(country:string,now=new Date()){
    const [coverage,demand,runs]=await Promise.all([
      this.db.select({id:epgPrograms.id}).from(epgPrograms).innerJoin(channels,eq(channels.id,epgPrograms.channelId))
        .where(and(eq(channels.country,country),eq(channels.active,true),gt(epgPrograms.endAt,now))).limit(1),
      this.db.select().from(epgCountryDemand).where(eq(epgCountryDemand.country,country)).limit(1),
      this.db.all<{status:string;started_at:number}>(sql`select status,started_at from epg_sync_runs where source_id=${'iptv-org:'+country} order by started_at desc limit 1`),
    ]);
    if(coverage.length)return {state:'ready' as const,retryAfterSeconds:0};
    const run=runs[0],requested=+(demand[0]?.requestedAt??0);
    const running=run?.status==='running'&&run.started_at>+now-15*60_000;
    const failed=run?.status==='failed'&&run.started_at>=requested;
    if(running||(!failed&&requested>+now-6*60_000))return {state:'preparing' as const,retryAfterSeconds:10};
    return {state:requested||run?'unavailable' as const:'not_loaded' as const,retryAfterSeconds:Math.max(0,Math.ceil((requested+15*60_000-+now)/1000))};
  }
  // A database compare-and-set protects different Vercel instances as well as devices.
  async claim(country:string,now=new Date()){
    if(!getConfig().EPG_COUNTRIES.split(',').map(c=>c.trim()).includes(country))return false;
    const status=await this.status(country,now);
    if(status.state==='ready'||status.state==='preparing')return false;
    const rows=await this.db.all(sql`update epg_country_demand set requested_at=${+now}
      where country=${country} and exists(select 1 from profiles where country=${country})
      and (requested_at is null or requested_at<${+now-15*60_000}) returning country`);
    return rows.length===1;
  }
  async cleanup(now=new Date()){
    // A single atomic batch avoids a remote interactive transaction expiring
    // during many country-by-country network round trips. Every predicate is
    // evaluated inside that transaction, so a concurrent return cannot be purged.
    const dormant=sql`select country from epg_country_demand d
        where inactive_since<=${+now-14*DAY} and not exists(select 1 from profiles p where p.country=d.country)
        and not exists(select 1 from epg_sync_runs s where s.source_id='iptv-org:'||d.country and s.status='running' and s.started_at>${+now-15*60_000})`;
    const result=await this.db.batch([
      this.db.select({country:epgCountryDemand.country}).from(epgCountryDemand).where(sql`${epgCountryDemand.country} in (${dormant})`),
      this.db.delete(epgPrograms).where(sql`${epgPrograms.channelId} in (select id from channels where country in (${dormant}))`),
      this.db.update(channels).set({active:false}).where(sql`${channels.country} in (${dormant})`),
      this.db.delete(channels).where(sql`${channels.country} in (${dormant}) and not exists(select 1 from channel_favorites f where f.channel_id=channels.id)`),
      this.db.delete(epgSyncRuns).where(sql`substr(${epgSyncRuns.sourceId},10) in (${dormant}) and ${epgSyncRuns.sourceId} like 'iptv-org:%'`),
      this.db.delete(epgTmdbMatches).where(sql`substr(${epgTmdbMatches.normalizedTitle},1,2) in (${dormant}) and substr(${epgTmdbMatches.normalizedTitle},3,1)=':'`),
    ]);
    return result[0].map(r=>r.country);
  }
}
