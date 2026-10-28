import '../src/env.js';
import {writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {getDatabase,closeDatabase} from '../src/db/client.js';
import {cinemaListings} from '../src/db/schema.js';
import {CinemaRepository} from '../src/repositories/cinema-repository.js';
import {fetchCinemaSnapshot,cinemaCityIdentity,fetchCinemaText} from '../src/services/cinema-sources.js';
import {chains,type CinemaEntry} from '../src/domain/cinema.js';
import {cinemaTitle} from '../src/services/cinema-matching.js';
import {normalizeSearch} from '../src/services/search-ranking.js';
import {calendarDay} from '../src/domain/releases.js';

// Read-only audit of public source data and shared cinema tables. No user rows,
// credentials, HTTP headers, raw HTML or source synopses are recorded.
async function parallel<T,R>(items:T[],work:(v:T)=>Promise<R>,limit=3):Promise<R[]>{
  const results:R[]=new Array(items.length);let cursor=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{for(;;){const i=cursor++;if(i>=items.length)return;results[i]=await work(items[i]!);}}));return results;
}
async function main(){
  const local=process.argv.includes('--local');
  if(local)process.env.TURSO_DATABASE_URL=`file:${fileURLToPath(new URL('../../.tooling/cinema-trial.db',import.meta.url)).replaceAll('\\','/')}`;
  const db=getDatabase(),repo=new CinemaRepository(db),stored=await db.select().from(cinemaListings);
  const day=calendarDay(new Date(),'Europe/Bucharest');
  const report:{day:string;chains:unknown[];entries:any[]}={day,chains:[],entries:[]};
  for(const chain of chains){
    const snapshot=await fetchCinemaSnapshot(chain),saved=new Map((await repo.mappings(chain)).map(m=>[m.sourceId,m]));
    const records=await parallel(snapshot.entries,async raw=>{
      let entry:CinemaEntry=raw,enrichmentError=false,linkVerified=false;
      try{
        if(chain==='cinema_city'){entry=await cinemaCityIdentity(raw);linkVerified=true;}
        else{
          const detail=JSON.parse(await fetchCinemaText(`https://app.cineplexx.ro/api/v1/movies/${encodeURIComponent(raw.sourceId)}`));
          linkVerified=detail.id===raw.sourceId&&(detail.titleCalculated||detail.title).trim()===raw.title;
        }
      }catch{enrichmentError=true;}
      const mapping=saved.get(entry.sourceId),listing=stored.find(l=>l.chain===chain&&l.sourceId===entry.sourceId);
      return {chain,...entry,enrichmentError,linkVerified,tmdbId:mapping?.tmdbId??null,savedTitle:mapping?.title??null,
        persisted:!!listing&&listing.active,storedDate:listing?.runDate??null,storedCurrent:listing?.current??null,storedUpcoming:listing?.upcoming??null,
        membershipMatches:!!listing&&listing.active&&listing.runDate===entry.date&&listing.current===entry.current&&listing.upcoming===entry.upcoming,
        phase:entry.date&&entry.date>day?'upcoming':entry.current?'current':'past',identityEvidence:null as unknown};
    });
    report.entries.push(...records);const summary={chain,sourceEntries:records.length,currentFeed:snapshot.currentCount,upcomingFeed:snapshot.upcomingCount,current:records.filter(r=>r.phase==='current').length,future:records.filter(r=>r.phase==='upcoming').length,matched:records.filter(r=>r.tmdbId).length,unmatched:records.filter(r=>!r.tmdbId).length,membershipMismatches:records.filter(r=>!r.membershipMatches).length,enrichmentFailures:records.filter(r=>r.enrichmentError).length};
    report.chains.push(summary);console.log(JSON.stringify(summary));
  }
  const ids=[...new Set(report.entries.flatMap(e=>e.tmdbId?[e.tmdbId as number]:[]))];
  const facts=new Map<number,any>();
  await parallel(ids,async id=>{
    const r=await fetch(`https://api.themoviedb.org/3/movie/${id}?append_to_response=credits,alternative_titles,release_dates,translations&language=en-US`,{headers:{Authorization:`Bearer ${process.env.TMDB_READ_ACCESS_TOKEN}`},signal:AbortSignal.timeout(15000)});
    if(!r.ok){facts.set(id,{error:r.status});return;}
    const data=await r.json() as any;facts.set(id,data);
  });
  for(const e of report.entries){
    if(!e.tmdbId)continue;const f=facts.get(e.tmdbId);
    if(f?.error){e.identityEvidence={httpError:f.error};continue;}
    const names=[f.title,f.original_title,...(f.alternative_titles?.titles??[]).map((a:any)=>a.title),...(f.translations?.translations??[]).map((a:any)=>a.data?.title)].filter(Boolean).map(cinemaTitle);
    const sourceNames=[e.title,e.originalTitle].filter(Boolean).map(cinemaTitle);
    const directors=(f.credits?.crew??[]).filter((p:any)=>p.job==='Director').map((p:any)=>p.name);
    const actors=(f.credits?.cast??[]).map((p:any)=>p.name);
    const year=f.release_date?Number(f.release_date.slice(0,4)):null;
    e.identityEvidence={title:f.title,originalTitle:f.original_title,year,exactTitle:sourceNames.some(t=>names.includes(t)),directorMatch:e.directors.some((d:string)=>directors.map(normalizeSearch).includes(normalizeSearch(d))),castMatches:[...new Set(e.actors.map(normalizeSearch))].filter(a=>actors.map(normalizeSearch).includes(a)).length,sourceYear:e.originalYear,yearConflict:e.originalYear&&year?Math.abs(e.originalYear-year)>1:false,romaniaDates:f.release_dates?.results?.find((r:any)=>r.iso_3166_1==='RO')?.release_dates?.filter((r:any)=>[2,3].includes(r.type)).map((r:any)=>r.release_date.slice(0,10))??[]};
  }
  const dir=fileURLToPath(new URL('../../.tooling/',import.meta.url));await mkdir(dir,{recursive:true});
  const file=`cinema-catalog-audit${local?'-local':''}.json`;
  await writeFile(`${dir}${file}`,JSON.stringify(report,null,2));
  console.log(JSON.stringify({publicReport:`.tooling/${file}`,uniqueTmdbTitlesChecked:ids.length,matchedEntries:report.entries.filter(e=>e.tmdbId).length,identityReview:report.entries.filter(e=>e.tmdbId&&(e.identityEvidence?.yearConflict||(!e.identityEvidence?.directorMatch&&e.identityEvidence?.castMatches<2&&!e.originalYear))).map(e=>({chain:e.chain,title:e.title,id:e.tmdbId,evidence:e.identityEvidence})),unmatchedCount:report.entries.filter(e=>!e.tmdbId).length}));
}
main().catch(()=>{console.error('CINEMA_AUDIT_FAILED_DETAILS_WITHHELD');process.exitCode=1;}).finally(closeDatabase);
