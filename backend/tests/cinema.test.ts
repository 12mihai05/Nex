import {afterEach,expect,it,vi} from 'vitest';
import {createClient} from '@libsql/client';
import {drizzle} from 'drizzle-orm/libsql';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {eq} from 'drizzle-orm';
import {fileURLToPath} from 'node:url';
import * as schema from '../src/db/schema.js';
import {assertHealthySnapshot,cinemaDateKind,enrichCinemaCity,fingerprint,parseCinemaSnapshot,type CinemaEntry,type CinemaSnapshot} from '../src/domain/cinema.js';
import {chooseCinemaMatch,CinemaMatcher,cinemaTitle} from '../src/services/cinema-matching.js';
import {CinemaRepository,supplementReleases,type CinemaMapping} from '../src/repositories/cinema-repository.js';
import {CinemaImporter} from '../src/services/cinema-import.js';
import {eligibleReleases} from '../src/services/release-tracking.js';
import {LiveTmdbRepository,FixtureTmdbRepository} from '../src/repositories/tmdb-repository.js';
import {fixtureCatalog} from '../src/fixtures/catalog.js';
import {resetConfigForTests} from '../src/config.js';
import {fetchCinemaText} from '../src/services/cinema-sources.js';

const movie={...fixtureCatalog[0]!,id:100,title:'Dune',originalTitle:'Dune',year:2021,releaseDate:'2021-09-15',director:'Denis Villeneuve',cast:['Rebecca Ferguson','Jason Momoa'],availability:[]};
const entry:CinemaEntry={sourceId:'a',title:'Dune',originalTitle:'Dune',originalYear:2021,directors:['Denis Villeneuve'],actors:[],date:'2026-12-04',url:'https://www.cinemacity.ro/films/dune/a',current:true,upcoming:false};
const now=Date.parse('2026-10-28T12:00:00Z'),day=86400000;
const snapshot=(entries:CinemaEntry[]=[entry]):CinemaSnapshot=>({chain:'cinema_city',entries,currentCount:entries.length,upcomingCount:1,hash:fingerprint(entries)});
const mapping=(e=entry):CinemaMapping=>({chain:'cinema_city',sourceId:e.sourceId,title:e.title,tmdbId:movie.id,identityHash:'identity',evidenceJson:'{"version":3}',movieJson:JSON.stringify(movie),checkedAt:now});
const clients:ReturnType<typeof createClient>[]=[];
async function db(){const client=createClient({url:':memory:'});clients.push(client);const db=drizzle(client,{schema});await migrate(db,{migrationsFolder:fileURLToPath(new URL('../drizzle',import.meta.url))});return db;}
afterEach(()=>{clients.splice(0).forEach(c=>c.close());vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks();resetConfigForTests();});

it('validates every source entry, collapses variant membership and preserves local calendar dates',()=>{
  const raw={body:{posters:[{code:'a',featureTitle:'Dune',url:entry.url,dateStarted:'2026-12-04T00:00:00+02:00'}]}};
  const s=parseCinemaSnapshot('cinema_city',raw,raw);
  expect(s.entries).toHaveLength(1);expect(s.entries[0]).toMatchObject({date:'2026-12-04',current:true,upcoming:true});
  expect(()=>parseCinemaSnapshot('cinema_city',{body:{posters:[]}},raw)).toThrow();
  expect(()=>parseCinemaSnapshot('cinema_city',{body:{posters:[...raw.body.posters,{...raw.body.posters[0],code:'b',dateStarted:'2026-02-30'}]}},raw)).toThrow();
  expect(()=>parseCinemaSnapshot('cinema_city',{body:{posters:[{...raw.body.posters[0],url:'http://localhost/admin'}]}},raw)).toThrow();
  expect(()=>parseCinemaSnapshot('cineplexx',{items:[],nextPage:2},[])).toThrow();
  const cp=[{id:'HO00007086',title:'Dune',startDate:'2026-12-04'}];
  expect(parseCinemaSnapshot('cineplexx',cp,cp).entries[0]?.url).toBe('https://www.cineplexx.ro/film/HO00007086');
});
it('quarantines mass drops and parses optional detail fields without executing source scripts',()=>{
  expect(()=>assertHealthySnapshot({...snapshot(),currentCount:3},{currentCount:20,upcomingCount:1})).toThrow('CINEMA_SUSPICIOUS_POPULATION_DROP');
  const detail=enrichCinemaCity(entry,'var filmDetails = {"id":"a","originalName":"Dune","releaseYear":"2021","directors":"Denis Villeneuve","cast":null};');
  expect(detail.originalYear).toBe(2021);expect(detail.actors).toEqual([]);
  expect(()=>enrichCinemaCity(entry,'var filmDetails = function(){return {}};')).toThrow();
  expect(()=>enrichCinemaCity(entry,'var filmDetails = {"id":"other","originalName":"Dune"};')).toThrow();
});
it('matches reissues by original year and evidence, never run year, popularity or title alone',()=>{
  const remake={...movie,id:101,year:1984,director:'David Lynch',cast:[]};
  expect(chooseCinemaMatch(entry,[{item:movie,aliases:[]},{item:remake,aliases:[]}])?.id).toBe(100);
  expect(chooseCinemaMatch({...entry,originalYear:null,directors:[],actors:[]},[{item:movie,aliases:[]}])).toBeNull();
  expect(chooseCinemaMatch({...entry,originalYear:null},[{item:movie,aliases:[]},{item:{...movie,id:102},aliases:[]}])).toBeNull();
  expect(cinemaDateKind(movie.releaseDate,entry.date)).toBe('reissue');
  expect(chooseCinemaMatch({...entry,title:'Duna',originalTitle:null},[{item:movie,aliases:['Duna']}])?.id).toBe(100);
});
it('uses original-language search titles even when TMDb displays an English translation',async()=>{
  const catalog=new FixtureTmdbRepository();vi.spyOn(catalog,'getTitle').mockResolvedValue({...movie,title:'Bitter Christmas',originalTitle:'Amarga Navidad',year:2026,director:'Pedro Almodovar'});
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({results:[{id:100,title:'Bitter Christmas',original_title:'Amarga Navidad',release_date:'2026-03-01'}]}))));
  expect((await new CinemaMatcher('synthetic',catalog).match({...entry,title:'Crăciun amar',originalTitle:'Amarga Navidad',originalYear:null,directors:['Pedro Almodovar']}))?.id).toBe(100);
});
it('checks all bounded same-name candidates using credits instead of rejecting titles with over six matches',async()=>{
  const catalog=new FixtureTmdbRepository();vi.spyOn(catalog,'getTitle').mockImplementation(async(_type,id)=>({...movie,id,title:'Artificial',originalTitle:'Artificial',director:id===107?'Luca Guadagnino':'Different director',cast:[]}));
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({results:Array.from({length:9},(_,i)=>({id:100+i,title:'Artificial',original_title:'Artificial',release_date:'2026-01-01'}))}))));
  expect((await new CinemaMatcher('synthetic',catalog).match({...entry,title:'Artificial',originalTitle:'Artificial',originalYear:null,directors:['Luca Guadagnino']}))?.id).toBe(107);
});
it('extracts explicit original-title years for reissues without stripping numeric movie titles or guessing from screening dates',()=>{
  expect(cinemaTitle('Fight Club (1999)')).toBe('fight club');expect(cinemaTitle('1984')).toBe('1984');
  const old={...movie,title:'Fight Club',originalTitle:'Fight Club',year:1999};
  expect(chooseCinemaMatch({...entry,title:'Fight Club',originalTitle:'Fight Club (1999)',originalYear:null,directors:[],date:'2026-11-23'},[{item:old,aliases:[]},{item:{...old,id:101,year:2023},aliases:[]}])?.id).toBe(100);
  expect(chooseCinemaMatch({...entry,originalYear:null,directors:[],actors:['Rebecca Ferguson','Rebecca Ferguson']},[{item:movie,aliases:[]}])).toBeNull();
});
it('accepts shortened titles only with corroborating director and two distinct cast members',()=>{
 const e={...entry,title:'Ebenezer: A Christmas Carol',originalTitle:'Ebenezer: A Christmas Carol',actors:['Rebecca Ferguson','Jason Momoa']};
 const target={...movie,title:'Ebenezer',originalTitle:'Ebenezer'};
 expect(chooseCinemaMatch(e,[{item:target,aliases:[]}])?.id).toBe(100);
 expect(chooseCinemaMatch({...e,actors:[]},[{item:target,aliases:[]}])).toBeNull();
 const long={...e,title:'Jocurile foamei: Răsăritul în ziua extra',originalTitle:null};
 expect(chooseCinemaMatch(long,[{item:movie,aliases:['Jocurile foamei: Răsăritul în ziua extragerii']}])?.id).toBe(100);
});
it('future ticket sales are upcoming, source failures become stale rather than confirmed absence',async()=>{
  const database=await db(),repo=new CinemaRepository(database);
  await repo.publish(snapshot(),[mapping()],0,now);
  expect((await repo.info(100,now)).listings[0]).toMatchObject({status:'upcoming',dateKind:'reissue'});
  await repo.failure('cinema_city',now+day);
  expect((await repo.info(100,now+day)).listings).toHaveLength(1);
  expect((await repo.info(100,now+4*day)).listings).toHaveLength(0);
  expect(await database.select().from(schema.cinemaListings)).toHaveLength(1);
});
it('prefers the standard run over a later Hungarian dub consistently in details, Upcoming and alerts',async()=>{
 const database=await db(),repo=new CinemaRepository(database);
 const standard={...entry,date:'2026-09-25'},dub={...entry,sourceId:'hu',title:'Dune hu dub',date:'2026-12-25',current:false,upcoming:true};
 const futureMovie={...movie,year:2026,releaseDate:'2026-09-24'};
 await repo.publish(snapshot([standard,dub]),[{...mapping(),movieJson:JSON.stringify(futureMovie)},{...mapping(dub),movieJson:JSON.stringify(futureMovie)}],0,now);
 const info=await repo.info(100,now);expect(info.listings).toHaveLength(1);expect(info.listings[0]).toMatchObject({status:'listed',date:'2026-09-25'});expect(info.dateConflict).toBe(false);
 expect(await repo.upcoming('2026-10-28',now)).toEqual([]);
 expect(supplementReleases({title:'Film',releases:[]},info,now).releases.some(r=>r.date==='2026-12-25')).toBe(false);
 // Preserve complete source tracking, even though the extra variant is hidden.
 expect(await database.select().from(schema.cinemaListings)).toHaveLength(2);
});
it('labels a sole Hungarian dub honestly and does not turn it into a first-premiere alert',async()=>{
 const database=await db(),repo=new CinemaRepository(database);
 const dub={...entry,title:'Dune hu dub',date:'2026-11-13'};
 await repo.publish(snapshot([dub]),[{...mapping(dub),movieJson:JSON.stringify({...movie,year:2026,releaseDate:'2026-11-01'})}],0,now);
 const info=await repo.info(100,now);expect(info.listings[0]?.variant).toBe('Hungarian dubbed');
 expect(await repo.upcoming('2026-10-28',now)).toEqual([]);
 expect(supplementReleases({title:'Film',releases:[]},info,now).releases).toEqual([]);
});
it('requires independent absences, retains a surviving variant, cleans only listings and restores reappearance',async()=>{
  const database=await db(),repo=new CinemaRepository(database),variant={...entry,sourceId:'b'};
  const past={...entry,date:'2026-10-20'};
  await repo.publish(snapshot([past,{...variant,date:past.date}]),[mapping(),mapping(variant)],0,now);
  await repo.publish(snapshot([{...variant,date:past.date}]),[],1,now+day);
  await repo.publish(snapshot([{...variant,date:past.date}]),[],2,now+day+1000);
  expect((await database.select().from(schema.cinemaListings).where(eq(schema.cinemaListings.sourceId,'a')))[0]!.missingChecks).toBe(1);
  await repo.publish(snapshot([{...variant,date:past.date}]),[],3,now+2*day);
  expect((await repo.info(100,now+2*day)).listings).toHaveLength(1);
  expect((await repo.info(100,now+2*day)).listings[0]!.status).toBe('listed');
  await repo.publish(snapshot([]),[],4,now+3*day);
  await repo.publish(snapshot([]),[],5,now+4*day);
  expect((await repo.info(100,now+4*day)).listings).toHaveLength(0);
  await repo.publish(snapshot([]),[],6,now+35*day);
  expect(await database.select().from(schema.cinemaListings)).toHaveLength(0);
  expect(await repo.mappings('cinema_city')).toHaveLength(2);
  await repo.publish(snapshot([past]),[],7,now+36*day);
  expect((await repo.info(100,now+36*day)).listings[0]?.status).toBe('listed');
});
it('publishes atomically and refuses stale worker snapshots',async()=>{
  const database=await db(),repo=new CinemaRepository(database);
  await repo.publish(snapshot(),[mapping()],0,now);
  await expect(repo.publish(snapshot([{...entry,date:'2027-01-01'}]),[],0,now+day)).rejects.toThrow('CINEMA_CONCURRENT_IMPORT');
  expect((await repo.info(100,now)).listings[0]!.date).toBe('2026-12-04');
});
it('keeps original premieres, suppresses conflict/backfill alerts and never announces reissues as first releases',async()=>{
  const database=await db(),repo=new CinemaRepository(database);
  await repo.publish(snapshot(),[mapping()],0,now);
  const reissue=await repo.info(100,now);
  const returnInfo=supplementReleases({title:'Dune',releases:[{key:'cinema:RO',kind:'cinema',date:'2021-10-22',season:null,country:'RO'}]},reissue,now);
  expect(returnInfo.releases[0]!.date).toBe('2021-10-22');
  expect(returnInfo.releases[1]).toMatchObject({key:'cinema:RO:reissue:2026-12-04',reissue:true,alertEligible:true});
  expect(eligibleReleases(returnInfo,'cinema',['cinema:RO'],'2026-12-03')).toEqual([]);
  expect(eligibleReleases(returnInfo,'cinema',['cinema:RO'],'2026-12-04')).toHaveLength(1);
  expect(eligibleReleases(returnInfo,'cinema',['cinema:RO','cinema:RO:reissue:2026-12-04'],'2026-12-04')).toEqual([]);
  const initial={...reissue,listings:reissue.listings.map(l=>({...l,dateKind:'initial' as const,date:'2026-11-13'}))};
  const info=supplementReleases({title:'New film',releases:[]},initial,now);
  expect(info.releases[0]).toMatchObject({date:'2026-11-13',source:'cinema_listing',alertEligible:true});
  expect(eligibleReleases(info,'cinema',[],'2026-11-12')).toEqual([]);
  expect(eligibleReleases(info,'cinema',[],'2026-11-13')).toHaveLength(1);
  const old={...initial,listings:initial.listings.map(l=>({...l,date:'2026-10-27'}))};
  expect(eligibleReleases(supplementReleases({title:'Old',releases:[]},old,now),'cinema',[],'2026-10-28')).toEqual([]);
  const conflict=supplementReleases({title:'New',releases:[]},{...initial,dateConflict:true},now);
  expect(conflict.releases).toEqual([]);
  const tmdb={title:'New',releases:[{kind:'cinema' as const,key:'cinema:RO',date:'2026-11-12',season:null,country:'RO'}]};
  expect(supplementReleases(tmdb,initial,now).releases[0]).toMatchObject({date:'2026-11-12',alertEligible:false});
});
it('retains all variants and does not reuse a mismatched identity when the enrichment budget is exhausted',async()=>{
  const database=await db(),repo=new CinemaRepository(database);
  await repo.publish(snapshot(),[mapping()],0,now);
  const importer=new CinemaImporter(repo,{fetchSnapshot:async()=>snapshot([{...entry,title:'Different movie'}]),enrich:async e=>e,match:async()=>movie});
  await importer.sync('cinema_city',{now:now+day,maxMatches:0});
  expect((await repo.info(100,now+day)).listings).toEqual([]);
  expect((await repo.mappings('cinema_city'))[0]!.tmdbId).toBeNull();
});
it('cinema HTTP failures and oversized/HTML bodies never parse into empty schedules',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('Blocked',{status:403})));
  await expect(fetchCinemaText('https://www.cinemacity.ro/test')).rejects.toThrow('CINEMA_HTTP_403');
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('<html>challenge</html>',{headers:{'content-type':'text/html'}})));
  await expect(fetchCinemaText('https://www.cinemacity.ro/test')).rejects.toThrow('CINEMA_NOT_JSON');
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('[]',{headers:{'content-type':'application/json','content-length':'2000001'}})));
  await expect(fetchCinemaText('https://www.cinemacity.ro/test')).rejects.toThrow('CINEMA_RESPONSE_TOO_LARGE');
});
it('details and stable upcoming pages share canonical data, retain pagination and never fetch cinema websites',async()=>{
  vi.stubEnv('CINEMA_IMPORT_ENABLED','true');resetConfigForTests();
  vi.spyOn(Date,'now').mockReturnValue(now);
  const database=await db(),repo=new CinemaRepository(database);
  const future={...movie,year:2026,releaseDate:'2026-11-12'};
  const m={...mapping(),movieJson:JSON.stringify(future)};
  await repo.publish(snapshot([{...entry,date:'2026-11-13'}]),[m],0,now);
  const fetcher=vi.fn(async(url:URL)=>{
    expect(url.hostname).toBe('api.themoviedb.org');
    if(url.pathname.endsWith('/release_dates'))return new Response(JSON.stringify({results:[{iso_3166_1:'RO',release_dates:[{type:3,release_date:'2026-12-01'}]}]}));
    if(url.pathname.includes('/discover/'))return new Response(JSON.stringify({results:[{id:100,title:'Dune',release_date:'2026-11-12'},{id:101,title:'Another',release_date:'2026-12-01'}],total_pages:2}));
    return new Response(JSON.stringify({title:'Dune',release_dates:{results:[]}}));
  });vi.stubGlobal('fetch',fetcher);
  const catalog=new LiveTmdbRepository('synthetic',database);
  const info=await catalog.releases('movie',100,'RO');expect(info.releases[0]?.date).toBe('2026-11-13');
  expect((await catalog.releases('movie',100,'GB')).cinema).toBeUndefined();
  const first=await catalog.upcoming('RO','2026-10-28',1);expect(first.items.map(i=>i.id)).toEqual([100]);
  await repo.publish(snapshot([{...entry,date:'2027-01-01'},{...entry,sourceId:'b'}]),[m,{...m,sourceId:'b',tmdbId:102,movieJson:JSON.stringify({...future,id:102})}],1,now+1000);
  const next=await catalog.upcoming('RO','2026-10-28',2);expect(next.items.map(i=>i.id)).toEqual([101]);expect(next.hasMore).toBe(true);
  expect((await catalog.upcoming('RO','2026-10-28',1)).items.map(i=>i.id)).toEqual([100]);
});
it('missing English overview uses an available translation and remembers a successful lookup',async()=>{
  const database=await db();let translationCalls=0;
  const fetcher=vi.fn(async(url:URL)=>{
    if(url.pathname.endsWith('/translations')){translationCalls++;return new Response(JSON.stringify({translations:[{iso_639_1:'ro',data:{overview:'Poveste în română.'}}]}));}
    return new Response(JSON.stringify({id:1,title:'Film',overview:'',original_language:'ro',release_date:'2026-11-06',credits:{cast:[{name:'Actor'}],crew:[{job:'Director',name:'Director'}]}}));
  });vi.stubGlobal('fetch',fetcher);
  const catalog=new LiveTmdbRepository('synthetic',database);
  expect(await catalog.getTitle('movie',1,'RO')).toMatchObject({overview:'Poveste în română.',overviewLanguage:'ro',cast:['Actor'],director:'Director'});
  await catalog.getTitle('movie',1,'RO');expect(translationCalls).toBe(1);
});
it.each(['','An English synopsis.'])('handles unavailable translations without discarding credits: overview=%s',async overview=>{
  const database=await db();let translations=0;
  vi.stubGlobal('fetch',vi.fn(async(url:URL)=>{
    if(url.pathname.endsWith('/translations')){translations++;return new Response(JSON.stringify({translations:[]}));}
    return new Response(JSON.stringify({id:1,title:'Film',overview,original_language:'ro',release_date:'2026-11-06',credits:{cast:[{name:'Actor'}]}}));
  }));
  const catalog=new LiveTmdbRepository('synthetic',database);
  expect((await catalog.getTitle('movie',1,'RO'))?.overview).toBe(overview);
  expect((await catalog.getTitle('movie',1,'RO'))?.cast).toEqual(['Actor']);
  expect(translations).toBe(overview?0:1);
});
it('an unavailable optional translation leaves title facts usable and retryable',async()=>{
  const database=await db();
  vi.stubGlobal('fetch',vi.fn(async(url:URL)=>url.pathname.endsWith('/translations')?new Response('',{status:503}):new Response(JSON.stringify({id:1,title:'Film',overview:'',original_language:'ro',release_date:'2026-11-06'}))));
  const item=await new LiveTmdbRepository('synthetic',database).getTitle('movie',1,'RO');
  expect(item?.title).toBe('Film');expect(item?.overviewFallbackChecked).not.toBe(true);
});
it('repeated imports avoid unnecessary listing writes and a chain failure cannot remove the other chain',async()=>{
  const database=await db(),repo=new CinemaRepository(database);
  await repo.publish(snapshot(),[mapping()],0,now);
  const cp={...snapshot(),chain:'cineplexx' as const};
  await repo.publish(cp,[{...mapping(),chain:'cineplexx'}],0,now);
  expect((await repo.publish(snapshot(),[mapping()],1,now+day)).changed).toBe(0);
  await repo.failure('cineplexx',now+4*day);
  await repo.publish(snapshot(),[mapping()],2,now+4*day);
  expect((await repo.info(100,now+4*day)).listings.map(r=>r.chain)).toEqual(['cinema_city']);
});
it('matching-budget exhaustion publishes complete membership and resumes new identities next run',async()=>{
  const database=await db(),repo=new CinemaRepository(database);
  const importer=new CinemaImporter(repo,{fetchSnapshot:async()=>snapshot([entry,{...entry,sourceId:'b'}]),enrich:async e=>e,match:async e=>{if(e.sourceId==='b')throw new Error('CINEMA_MATCH_BUDGET');return movie;}});
  const result=await importer.sync('cinema_city',{now});
  expect(result.matched).toBe(1);expect(result.deferred).toBe(1);
  expect(await database.select().from(schema.cinemaListings)).toHaveLength(2);
  const resume=new CinemaImporter(repo,{fetchSnapshot:async()=>snapshot([entry,{...entry,sourceId:'b'}]),enrich:async e=>e,match:async()=>movie});
  expect((await resume.sync('cinema_city',{now:now+1000})).matched).toBe(2);
});
it('Upcoming never labels a worldwide date as a Romanian release',async()=>{
  const database=await db();
  vi.stubGlobal('fetch',vi.fn(async(url:URL)=>new Response(JSON.stringify(url.pathname.includes('/discover/')
    ?{results:[{id:1,title:'Film',release_date:'2026-11-01'},{id:2,title:'No local date',release_date:'2026-11-01'}],total_pages:1}
    :{results:[{iso_3166_1:'US',release_dates:[{type:3,release_date:'2026-11-01'}]},...(url.pathname.includes('/1/')?[{iso_3166_1:'RO',release_dates:[{type:3,release_date:'2026-11-13'}]}]:[])]}))));
  const result=await new LiveTmdbRepository('synthetic',database).upcoming('RO','2026-10-28',1);
  expect(result.items.map(i=>({id:i.id,date:i.releaseDate}))).toEqual([{id:1,date:'2026-11-13'}]);
});
it('TMDb-only Upcoming retains a future reissue without changing the original movie year',async()=>{
 const database=await db();
 vi.stubGlobal('fetch',vi.fn(async(url:URL)=>new Response(JSON.stringify(url.pathname.includes('/discover/')
  ?{results:[{id:550,title:'Fight Club',release_date:'1999-10-15'}],total_pages:1}
  :{results:[{iso_3166_1:'RO',release_dates:[{type:3,release_date:'1999-12-01'},{type:4,release_date:'2026-11-01'},{type:3,release_date:'2026-11-23'}]}]}))));
 const result=await new LiveTmdbRepository('synthetic',database).upcoming('RO','2026-10-28',1);
 expect(result.items[0]).toMatchObject({id:550,year:1999,releaseDate:'2026-11-23',cinemaDateKind:'reissue'});
});
it('a temporary cinema lookup failure does not cache an empty upcoming list',async()=>{
  vi.stubEnv('CINEMA_IMPORT_ENABLED','true');resetConfigForTests();
  const database=await db();
  const lookup=vi.spyOn(CinemaRepository.prototype,'upcoming').mockRejectedValueOnce(new Error('temporary')).mockResolvedValueOnce([movie]);
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({results:[],total_pages:0}))));
  const catalog=new LiveTmdbRepository('synthetic',database);
  expect((await catalog.upcoming('RO','2026-10-28',1)).items).toEqual([]);
  expect((await catalog.upcoming('RO','2026-10-28',1)).items.map(i=>i.id)).toEqual([100]);
  expect(lookup).toHaveBeenCalledTimes(2);
});
it('one unavailable identity keeps healthy membership fresh, invalidates changed titles and retries next run',async()=>{
  const database=await db(),repo=new CinemaRepository(database);
  await repo.publish(snapshot(),[mapping()],0,now);
  const changed={...entry,title:'A different film'},b={...entry,sourceId:'b'};
  const importer=new CinemaImporter(repo,{fetchSnapshot:async()=>snapshot([changed,b]),enrich:async e=>{if(e.sourceId==='a')throw new Error('CINEMA_HTTP_404');return e;},match:async()=>({...movie,id:101})});
  expect(await importer.sync('cinema_city',{now:now+day})).toMatchObject({total:2,matched:1,deferred:1,enrichmentFailed:1});
  expect((await repo.info(100,now+day)).listings).toEqual([]);
  expect((await repo.info(101,now+day)).listings).toHaveLength(1);
  expect((await repo.state('cinema_city'))?.checkedAt).toBe(now+day);
  const retry=new CinemaImporter(repo,{fetchSnapshot:async()=>snapshot([changed,b]),enrich:async e=>e,match:async()=>({...movie,id:102})});
  expect(await retry.sync('cinema_city',{now:now+day+1000})).toMatchObject({matched:2,deferred:0,enrichmentFailed:0});
});
