import {it,expect,vi} from 'vitest';
import {createClient} from '@libsql/client';
import {drizzle} from 'drizzle-orm/libsql';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {eq} from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import {calendarDay,movieReleases,seriesReleases,releaseDate,type ReleaseInfo} from '../src/domain/releases.js';
import {ReleaseTracking,eligibleReleases} from '../src/services/release-tracking.js';
import {FixtureTmdbRepository,LiveTmdbRepository} from '../src/repositories/tmdb-repository.js';
import {scoreCandidate} from '../src/services/recommendation.js';
import {filterQuerySchema} from '../src/domain/types.js';
import {fixtureCatalog} from '../src/fixtures/catalog.js';
import {EpgService} from '../src/services/epg/service.js';

async function database(){const client=createClient({url:':memory:'});await client.execute('PRAGMA foreign_keys=ON');const db=drizzle(client,{schema});await migrate(db,{migrationsFolder:new URL('../drizzle',import.meta.url).pathname.replace(/^\/(\w:)/,'$1')});return {client,db};}
it('preserves date-only values, rejects impossible dates and uses viewer day',()=>{
  expect(releaseDate('2027-02-30')).toBeNull();expect(releaseDate('')).toBeNull();expect(releaseDate('2028-02-29T00:00:00Z')).toBe('2028-02-29');
  expect(calendarDay(new Date('2026-10-10T22:30:00Z'),'Europe/Bucharest')).toBe('2026-10-11');
});
it('selects only local cinema/digital dates, ignores festival premieres and specials',()=>{
  const data={results:[{iso_3166_1:'US',release_dates:[{type:3,release_date:'2026-10-10'}]},{iso_3166_1:'RO',release_dates:[{type:1,release_date:'2026-10-01'},{type:3,release_date:'2026-10-15'},{type:4,release_date:'2026-11-10'}]}]};
  expect(movieReleases(data,'RO').map(r=>r.date)).toEqual(['2026-10-15','2026-11-10']);expect(movieReleases(data,'MD')).toEqual([]);
  expect(seriesReleases({seasons:[{season_number:0,air_date:'2026-10-01'},{season_number:2,air_date:null}]})).toEqual([{key:'season:2',kind:'season',date:null,season:2,country:null}]);
});
it('postponements, baseline and expiry prevent premature or stale alerts',()=>{
  const info:ReleaseInfo={title:'Example',releases:[{key:'season:2',kind:'season',date:'2026-10-10',season:2,country:null}]};
  expect(eligibleReleases(info,'season',[],'2026-10-09')).toEqual([]);
  expect(eligibleReleases(info,'season',['season:2'],'2026-10-10')).toEqual([]);
  expect(eligibleReleases(info,'season',[],'2026-10-18')).toEqual([]);
  expect(eligibleReleases(info,'season',[],'2026-10-11')).toHaveLength(1);
});
it('unreleased content is searchable but not a normal recommendation',()=>{
  const item={...fixtureCatalog[0]!,releaseDate:'2099-01-01'};
  const state={viewerIds:['u'],taste:[],temporaryMoods:[],ownedProviderIds:[],watchedIds:new Set<number>(),watchlistIds:new Set<number>()};
  expect(scoreCandidate(item,filterQuerySchema.parse({intent:'DISCOVERY'}),state)).toBeNull();
  expect(scoreCandidate(item,filterQuerySchema.parse({intent:'TITLE_LOOKUP'}),state)).not.toBeNull();
});
it('regional upcoming is paginated and never filtered by rating/provider',async()=>{
  const {client,db}=await database();
  try{
    const fetcher=vi.fn(async(url:URL)=>{
      expect(url.searchParams.get('region')).toBe('RO');expect(url.searchParams.get('with_release_type')).toBe('3|2');
      expect(url.searchParams.has('vote_count.gte')).toBe(false);expect(url.searchParams.has('with_watch_providers')).toBe(false);
      return new Response(JSON.stringify({results:[{id:1,title:'Future',release_date:'2026-10-20',vote_count:0,vote_average:0},{id:2,title:'Old',release_date:'2020-01-01'},{id:3,title:'Unknown',release_date:''}],total_pages:3}));
    });vi.stubGlobal('fetch',fetcher);
    const result=await new LiveTmdbRepository('synthetic',db).upcoming('RO','2026-10-10',1);
    expect(result.hasMore).toBe(true);expect(result.items).toHaveLength(1);expect(result.items[0]).toMatchObject({metadataOnly:true,releaseCountry:'RO',rating:null});
  }finally{vi.unstubAllGlobals();client.close();}
});
it('inbox baselines Seen series, deduplicates and isolates users, read state and countries',async()=>{
  const {client,db}=await database();const catalog=new FixtureTmdbRepository();
  let info:ReleaseInfo={title:'A series',releases:[{key:'season:1',kind:'season',date:'2020-01-01',season:1,country:null}]};
  const tracked=new ReleaseTracking(Object.assign(catalog,{releases:async()=>info}),db);
  try{
    await db.insert(schema.user).values([{id:'a',name:'A',email:'a@example.test'},{id:'b',name:'B',email:'b@example.test'}]);
    await db.insert(schema.profiles).values({userId:'a',country:'RO'});
    await db.insert(schema.watchHistory).values({id:'h',userId:'a',mediaType:'series',tmdbId:12,watchedAt:new Date(),titleSnapshot:'A series'});
    await tracked.setAuto('a',true);
    expect((await tracked.sync(new Date('2030-01-01T12:00:00Z'))).created).toBe(0);
    info={...info,releases:[...info.releases,{key:'season:2',kind:'season',date:'2030-01-02',season:2,country:null}]};
    expect((await tracked.sync(new Date('2030-01-02T12:00:00Z'))).created).toBe(1);
    expect((await tracked.sync(new Date('2030-01-03T12:00:00Z'))).created).toBe(0);
    const inbox=await tracked.inbox('a','RO');expect(inbox.items).toHaveLength(1);
    const id=inbox.items[0]!.id;
    expect((await tracked.inbox('b','RO')).items).toHaveLength(0);
    expect((await tracked.inbox('a','GB')).items).toHaveLength(0);
    await tracked.acknowledge('b',[id],'read');
    expect((await tracked.inbox('a','RO',0,true)).items).toHaveLength(1);
    await tracked.acknowledge('a',[id],'popup');
    expect((await tracked.inbox('a','RO',0,true)).items).toHaveLength(0);
    expect((await tracked.inbox('a','RO')).items[0]!.readAt).toBeNull();
    await tracked.acknowledge('a',[id],'read');
    expect((await tracked.inbox('a','RO')).items[0]!.readAt).not.toBeNull();
    await tracked.setAuto('a',false);
    info={...info,releases:[...info.releases,{key:'season:3',kind:'season',date:'2030-01-03',season:3,country:null}]};
    expect((await tracked.sync(new Date('2030-01-03T12:00:00Z'))).created).toBe(0);
    await db.delete(schema.user).where(eq(schema.user.id,'a'));
    expect(await db.select().from(schema.releaseNotifications)).toHaveLength(0);
    expect(await db.select().from(schema.releaseSubscriptions)).toHaveLength(0);
  }finally{client.close();}
});
it('provider failure retries without losing alerts; opt-out and country changes suppress new entries',async()=>{
  const {client,db}=await database();const catalog=new FixtureTmdbRepository();
  const info:ReleaseInfo={title:'Future film',releases:[{key:'cinema:RO',kind:'cinema',date:'2030-01-02',season:null,country:'RO'}]};
  let fail=false;
  const tracked=new ReleaseTracking(Object.assign(catalog,{releases:async()=>{if(fail)throw Error('PROVIDER');return info;}}),db);
  try{
    await db.insert(schema.user).values({id:'a',name:'A',email:'a@example.test'});await db.insert(schema.profiles).values({userId:'a'});
    await tracked.follow('a','movie',42,'cinema','RO',true);
    fail=true;expect((await tracked.sync(new Date('2030-01-02T12:00:00Z'))).failed).toBe(1);
    fail=false;expect((await tracked.sync(new Date('2030-01-03T12:00:00Z'))).created).toBe(1);
    await tracked.follow('a','movie',43,'cinema','RO',true);
    await db.update(schema.profiles).set({country:'GB'}).where(eq(schema.profiles.userId,'a'));
    expect((await tracked.sync(new Date('2030-01-04T12:00:00Z'))).created).toBe(0);
    await tracked.follow('a','movie',43,'cinema','RO',false);
    await db.update(schema.profiles).set({country:'RO'}).where(eq(schema.profiles.userId,'a'));
    expect((await tracked.sync(new Date('2030-01-04T12:00:00Z'))).created).toBe(0);
  }finally{client.close();}
});
it('inbox pagination has stable non-overlapping batches and read does not reorder them',async()=>{
  const {client,db}=await database();const tracked=new ReleaseTracking(new FixtureTmdbRepository(),db);
  try{
    await db.insert(schema.user).values({id:'a',name:'A',email:'a@example.test'});
    await db.insert(schema.releaseSubscriptions).values({id:'s',userId:'a',mediaType:'series',tmdbId:1,kind:'season',country:'RO'});
    await db.insert(schema.releaseNotifications).values(Array.from({length:35},(_,i)=>({id:String(i).padStart(3,'0'),userId:'a',subscriptionId:'s',eventKey:String(i),country:'RO',mediaType:'series' as const,tmdbId:1,title:'Series',body:'New season',releaseDate:'2030-01-01',createdAt:new Date('2030-01-01')})));
    const page1=await tracked.inbox('a','RO');expect(page1.items).toHaveLength(30);expect(page1.hasMore).toBe(true);
    await tracked.acknowledge('a',[page1.items[0]!.id],'read');
    const page2=await tracked.inbox('a','RO',30);expect(page2.items).toHaveLength(5);expect(page2.hasMore).toBe(false);
    expect(new Set([...page1.items,...page2.items].map(i=>i.id)).size).toBe(35);
  }finally{client.close();}
});
it('search repairs a narrow typo without filtering unreleased/unavailable titles',async()=>{
  const {client,db}=await database();
  try{
    const fetcher=vi.fn(async(url:URL)=>new Response(JSON.stringify({results:url.searchParams.get('query')==='doomsday'?[{id:42,media_type:'movie',title:'Avengers: Doomsday',release_date:'2099-01-01'},{id:43,media_type:'movie',title:'Doomsday'}]:[]})));
    vi.stubGlobal('fetch',fetcher);const catalog=new LiveTmdbRepository('synthetic',db);
    const found=await catalog.search({query:'Avangers Doomsday',region:'RO',summaryOnly:true});
    expect(found.map(i=>i.id)).toEqual([42]);expect(found[0]!.availability).toEqual([]);
  }finally{vi.unstubAllGlobals();client.close();}
});
it('programme enrichment is country-scoped, confidence-gated and survives provider failure',async()=>{
  const {client,db}=await database();const catalog=new FixtureTmdbRepository();const getTitle=vi.spyOn(catalog,'getTitle');
  try{
    await db.insert(schema.channels).values({id:'c',sourceId:'fixture',externalId:'c',displayName:'Channel',country:'RO'});
    await db.insert(schema.epgPrograms).values({id:'p',sourceId:'fixture',sourceProgramId:'p',channelId:'c',title:'Programme',description:'EPG plot',startAt:new Date(),endAt:new Date(Date.now()+3600000),matchedTmdbId:fixtureCatalog[0]!.id,matchedMediaType:'movie',matchConfidence:.7});
    const epg=new EpgService(db,undefined,catalog);
    expect((await epg.programmeDetails('p','RO')).cast).toEqual([]);expect(getTitle).not.toHaveBeenCalled();
    await expect(epg.programmeDetails('p','GB')).rejects.toThrow('PROGRAM_NOT_FOUND');
    await db.update(schema.epgPrograms).set({matchConfidence:.99}).where(eq(schema.epgPrograms.id,'p'));
    expect((await epg.programmeDetails('p','RO')).description).toBe('EPG plot');expect(getTitle).toHaveBeenCalledTimes(1);
    getTitle.mockRejectedValueOnce(new Error('PROVIDER_UNAVAILABLE'));
    expect(await epg.programmeDetails('p','RO')).toMatchObject({description:'EPG plot',cast:[]});
  }finally{client.close();}
});
