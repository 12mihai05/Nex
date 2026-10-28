import {and,eq,gt,lt} from 'drizzle-orm';
import type {NexDatabase} from '../db/client.js';
import {cinemaSources as sources,cinemaMappings as mappings,cinemaListings as listings} from '../db/schema.js';
import {assertHealthySnapshot,chainNames,cinemaDateKind,fingerprint,type CinemaChain,type CinemaSnapshot,type CinemaInfo,type CinemaListing} from '../domain/cinema.js';
import {calendarDay,type ReleaseInfo} from '../domain/releases.js';
import {contentItemSchema,type ContentItem} from '../domain/types.js';

export type CinemaMapping=typeof mappings.$inferInsert;
export const cinemaFreshMs=72*3600000;
type CinemaRow={listing:typeof listings.$inferSelect;mapping:typeof mappings.$inferSelect};
function foreignDub(row:CinemaRow){
  const original=JSON.parse(row.mapping.evidenceJson).originalTitle??'';
  return [row.mapping.title,original].some(t=>/^hu\s|\bhu[\s-]+dub\b/i.test(t));
}
function preferredVariants<T extends CinemaRow>(rows:T[]):T[]{
  const standard=new Set(rows.filter(r=>!foreignDub(r)).map(r=>`${r.listing.chain}:${r.listing.tmdbId}`));
  return rows.filter(r=>!foreignDub(r)||!standard.has(`${r.listing.chain}:${r.listing.tmdbId}`));
}
export class CinemaRepository {
  constructor(private db:NexDatabase){}
  async state(chain:CinemaChain){return (await this.db.select().from(sources).where(eq(sources.chain,chain)))[0];}
  async mappings(chain:CinemaChain){return this.db.select().from(mappings).where(eq(mappings.chain,chain));}
  async failure(chain:CinemaChain,now:number){
    await this.db.insert(sources).values({chain,attemptedAt:now,health:'failed'}).onConflictDoUpdate({target:sources.chain,set:{attemptedAt:now,health:'failed'},setWhere:lt(sources.attemptedAt,now)});
  }
  async publish(snapshot:CinemaSnapshot,matched:CinemaMapping[],expectedVersion:number,now:number){
    assertHealthySnapshot(snapshot,await this.state(snapshot.chain));
    return this.db.transaction(async tx=>{
      await tx.insert(sources).values({chain:snapshot.chain}).onConflictDoNothing();
      const claimed=await tx.update(sources).set({version:expectedVersion+1,checkedAt:now,attemptedAt:now,health:'ok',currentCount:snapshot.currentCount,upcomingCount:snapshot.upcomingCount,snapshotHash:snapshot.hash})
        .where(and(eq(sources.chain,snapshot.chain),eq(sources.version,expectedVersion))).returning({chain:sources.chain});
      if(!claimed.length)throw new Error('CINEMA_CONCURRENT_IMPORT');
      const old=new Map((await tx.select().from(listings).where(eq(listings.chain,snapshot.chain))).map(r=>[r.sourceId,r]));
      const saved=new Map((await tx.select().from(mappings).where(eq(mappings.chain,snapshot.chain))).map(r=>[r.sourceId,r]));
      for(const row of matched){
        const prev=saved.get(row.sourceId);
        if(prev&&prev.identityHash===row.identityHash&&prev.checkedAt===row.checkedAt)continue;
        await tx.insert(mappings).values(row).onConflictDoUpdate({target:[mappings.chain,mappings.sourceId],set:row});
        saved.set(row.sourceId,{...row,tmdbId:row.tmdbId??null,movieJson:row.movieJson??null,dateHistoryJson:row.dateHistoryJson??'[]'});
      }
      let changed=0;
      const seen=new Set<string>();
      for(const entry of snapshot.entries){
        seen.add(entry.sourceId);
        const mapping=saved.get(entry.sourceId),previous=old.get(entry.sourceId);
        const movie=mapping?.movieJson?contentItemSchema.parse(JSON.parse(mapping.movieJson)):null;
        const facts={tmdbId:mapping?.tmdbId??null,runDate:entry.date,sourceUrl:entry.url,dateKind:cinemaDateKind(movie?.releaseDate??null,entry.date),current:entry.current,upcoming:entry.upcoming};
        const hash=fingerprint(facts);
        const dateObservedAt=previous?.runDate===entry.date?previous.dateObservedAt:now;
        if(!previous||previous.factsHash!==hash||!previous.active||previous.missingChecks){
          const row={chain:snapshot.chain,sourceId:entry.sourceId,...facts,factsHash:hash,firstObservedAt:previous?.firstObservedAt??now,dateObservedAt,active:true,missingSince:null,lastAbsentAt:null,missingChecks:0};
          await tx.insert(listings).values(row).onConflictDoUpdate({target:[listings.chain,listings.sourceId],set:row});changed++;
        }
        if(mapping&&entry.date){
          const history=JSON.parse(mapping.dateHistoryJson) as Array<{date:string;kind:string;url:string;observedAt:number}>;
          if(!history.some(h=>h.date===entry.date&&h.kind===facts.dateKind&&h.url===entry.url)){
            history.push({date:entry.date,kind:facts.dateKind,url:entry.url,observedAt:now});
            await tx.update(mappings).set({dateHistoryJson:JSON.stringify(history.slice(-12))}).where(and(eq(mappings.chain,snapshot.chain),eq(mappings.sourceId,entry.sourceId)));
          }
        }
      }
      for(const row of old.values()){
        if(seen.has(row.sourceId)||!row.active)continue;
        if(row.lastAbsentAt&&now-row.lastAbsentAt<12*3600000)continue;
        const missingChecks=row.missingChecks+1;
        await tx.update(listings).set({missingChecks,missingSince:row.missingSince??now,lastAbsentAt:now,active:missingChecks<2})
          .where(and(eq(listings.chain,snapshot.chain),eq(listings.sourceId,row.sourceId)));changed++;
      }
      await tx.delete(listings).where(and(eq(listings.chain,snapshot.chain),eq(listings.active,false),lt(listings.missingSince,now-30*86400000)));
      return {changed,total:snapshot.entries.length,matched:snapshot.entries.filter(e=>saved.get(e.sourceId)?.tmdbId).length};
    });
  }

  async info(id:number,now=Date.now()):Promise<CinemaInfo>{
    const rows=await this.db.select({listing:listings,source:sources,mapping:mappings}).from(listings).innerJoin(sources,eq(listings.chain,sources.chain))
      .innerJoin(mappings,and(eq(listings.chain,mappings.chain),eq(listings.sourceId,mappings.sourceId)))
      .where(and(eq(listings.tmdbId,id),eq(listings.active,true),gt(sources.checkedAt,now-cinemaFreshMs)));
    const day=calendarDay(new Date(now),'Europe/Bucharest');
    const unique=new Map<string,CinemaListing>();
    for(const row of preferredVariants(rows)){
      const {listing:r,source:s}=row;
      const chain=r.chain as CinemaChain;
      const status=r.runDate&&r.runDate>day?'upcoming':r.current&&r.runDate&&r.runDate<=day?'listed':'past';
      const item:CinemaListing={chain,name:chainNames[chain],date:r.runDate,dateKind:r.dateKind as CinemaListing['dateKind'],status,sourceUrl:r.sourceUrl,checkedAt:new Date(r.missingSince??s.checkedAt).toISOString(),firstObservedAt:new Date(r.dateObservedAt).toISOString(),...(foreignDub(row)?{variant:'Hungarian dubbed' as const}:{})};
      const key=`${chain}:${r.runDate}`;
      const previous=unique.get(key);
      if(!previous||status==='listed')unique.set(key,item);
    }
    const result=[...unique.values()].sort((a,b)=>(a.date??'').localeCompare(b.date??'')||a.name.localeCompare(b.name));
    return {country:'RO',listings:result,dateConflict:new Set(result.filter(r=>r.dateKind==='initial'&&r.date&&!r.variant).map(r=>r.date)).size>1};
  }

  async upcoming(day:string,now=Date.now()):Promise<ContentItem[]>{
    const rows=await this.db.select({listing:listings,mapping:mappings}).from(listings)
      .innerJoin(sources,eq(listings.chain,sources.chain))
      .innerJoin(mappings,and(eq(listings.chain,mappings.chain),eq(listings.sourceId,mappings.sourceId)))
      .where(and(eq(listings.active,true),gt(sources.checkedAt,now-cinemaFreshMs)));
    const movies=new Map<number,ContentItem>();
    for(const row of preferredVariants(rows)){
      const {listing:r,mapping:m}=row;
      // A later foreign dub is not a new Romanian cinema premiere. Select
      // variants before date filtering, so a currently playing standard film
      // does not return to Upcoming solely because of its later dub.
      if(foreignDub(row)||!r.runDate||r.runDate<=day)continue;
      if(!m.tmdbId||!m.movieJson)continue;
      const parsed=contentItemSchema.safeParse(JSON.parse(m.movieJson));if(!parsed.success)continue;
      const previous=movies.get(m.tmdbId);
      if(previous?.releaseDate&&previous.releaseDate<=r.runDate!)continue;
      movies.set(m.tmdbId,{...parsed.data,releaseDate:r.runDate,releaseCountry:'RO',cinemaDateKind:r.dateKind as 'initial'|'reissue'|'unknown',availability:[]});
    }
    return [...movies.values()].sort((a,b)=>a.releaseDate!.localeCompare(b.releaseDate!)||a.id-b.id);
  }

}

export function supplementReleases(info:ReleaseInfo,cinema:CinemaInfo,now=Date.now()):ReleaseInfo{
  const dateRows=cinema.listings.filter(l=>l.date&&l.dateKind==='initial'&&!l.variant);
  const dates=[...new Set(dateRows.map(l=>l.date!))];
  const existing=info.releases.find(r=>r.kind==='cinema');
  const conflict=cinema.dateConflict||!!(existing?.date&&dates.some(d=>d!==existing.date));
  const releases=info.releases.map(r=>r.kind==='cinema'&&conflict?{...r,alertEligible:false}:r);
  if(!existing&&dates.length===1&&!conflict){
    const date=dates[0]!;
    const firstObserved=dateRows.map(r=>r.firstObservedAt).sort()[0]!;
    const observedDay=calendarDay(new Date(firstObserved),'Europe/Bucharest');
    releases.push({key:'cinema:RO',kind:'cinema',date,season:null,country:'RO',source:'cinema_listing',sourceUrl:dateRows[0]!.sourceUrl,alertEligible:observedDay<date&&now-Date.parse(dateRows[0]!.checkedAt)<cinemaFreshMs});
  }
  // Cinema returns are distinct events, not replacements for the original
  // premiere. Keep due events as well as future ones for the daily scheduler.
  for(const row of cinema.listings.filter(l=>l.date&&l.dateKind==='reissue'&&!l.variant)){
    const key=`cinema:RO:reissue:${row.date}`;
    if(releases.some(r=>r.key===key))continue;
    releases.push({key,kind:'cinema',date:row.date,season:null,country:'RO',reissue:true,source:'cinema_listing',sourceUrl:row.sourceUrl,
      alertEligible:calendarDay(new Date(row.firstObservedAt),'Europe/Bucharest')<row.date!&&now-Date.parse(row.checkedAt)<cinemaFreshMs});
  }
  return {...info,releases,cinema:{...cinema,dateConflict:conflict}};
}
