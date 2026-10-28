import '../src/env.js';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import type {ReleaseInfo} from '../src/domain/releases.js';
import type {ContentItem} from '../src/domain/types.js';

// Run audit-cinema-catalog.ts first. Only public title facts and result counts
// go into this report. Credentials and the disposable account stay in memory.
const base='https://nex-three-omega.vercel.app',password=randomUUID()+randomUUID();
let token:string|null=null;
const failures:Array<{stage:string;id?:number;reason:string}>=[],timings:number[]=[];
async function request(path:string,method='GET',body?:unknown){
 const started=Date.now();const r=await fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{'X-Nex-Invite':process.env.NEX_INVITE_CODE??''})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(60000)});timings.push(Date.now()-started);return r;
}
async function main(){
 const audit=JSON.parse(await readFile('.tooling/cinema-catalog-audit.json','utf8')) as {day:string;entries:Array<{tmdbId:number|null;chain:string;date:string|null;current:boolean;phase:string;title:string;originalTitle:string|null;url:string}>};
 const isForeign=(e:typeof audit.entries[number])=>/^hu\s|\bhu[\s-]+dub\b/i.test(e.title)||/^hu\s|\bhu[\s-]+dub\b/i.test(e.originalTitle??'');
 const preferred=audit.entries.filter(e=>!isForeign(e)||!audit.entries.some(other=>other.tmdbId===e.tmdbId&&other.chain===e.chain&&!isForeign(other)));
 const ids=[...new Set(audit.entries.flatMap(e=>e.tmdbId?[e.tmdbId]:[]))];
 assert.equal((await request('/api/upcoming')).status,401);
 const signup=await request('/api/auth/sign-up/email','POST',{name:'Full Cinema QA',email:`cinema-audit-${randomUUID()}@example.test`,password});assert.equal(signup.status,200);token=signup.headers.get('set-auth-token');assert.ok(token);
 assert.equal((await request('/api/me/settings','PUT',{country:'RO'})).status,200);
 let listed=0,upcoming=0;
 for(const id of ids){
  try{
   const r=await request(`/api/title/movie/${id}/releases`);if(r.status!==200){failures.push({stage:'releases',id,reason:`HTTP_${r.status}`});continue;}
   const info=(await r.json() as {data:ReleaseInfo}).data;
   const expected=preferred.filter(e=>e.tmdbId===id);
   for(const e of expected){
    const actual=info.cinema?.listings.find(l=>l.chain===e.chain&&l.date===e.date);
    if(!actual){failures.push({stage:'listing',id,reason:`missing_${e.chain}_${e.date}`});continue;}
    if(e.chain==='cineplexx'&&!actual.sourceUrl.includes('/film/'))failures.push({stage:'link',id,reason:'generic_homepage'});
    const status=e.date&&e.date>audit.day?'upcoming':e.current&&e.date?'listed':'past';
    if(actual.status!==status)failures.push({stage:'status',id,reason:`${actual.status}_expected_${status}`});
   }
   for(const actual of info.cinema?.listings??[])if(!expected.some(e=>e.chain===actual.chain&&e.date===actual.date))failures.push({stage:'variant',id,reason:'unexpected_variant_date'});
   if(info.cinema?.listings.some(l=>l.status==='listed'))listed++;
   if(info.cinema?.listings.some(l=>l.status==='upcoming'))upcoming++;
  }catch{failures.push({stage:'releases',id,reason:'request_failed'});}
 }
 const seen=new Set<number>(),pages=[];let hasMore=true;
 for(let page=1;hasMore&&page<=500;page++){
  const r=await request(`/api/upcoming?page=${page}`);if(r.status!==200){failures.push({stage:'upcoming',reason:`page_${page}_HTTP_${r.status}`});break;}
  const payload=await r.json() as {data:ContentItem[];meta:{hasMore:boolean;day:string}};
  assert.equal(payload.meta.day,audit.day,'audit crossed calendar days; rerun snapshot');
  for(const item of payload.data){
   if(seen.has(item.id))failures.push({stage:'pagination',id:item.id,reason:'duplicate'});
   if(!item.releaseDate||item.releaseDate<=audit.day||item.releaseCountry!=='RO')failures.push({stage:'upcoming_date',id:item.id,reason:'invalid_future_country_date'});
   seen.add(item.id);
  }
  pages.push({page,count:payload.data.length});hasMore=payload.meta.hasMore;
 }
 if(hasMore)failures.push({stage:'pagination',reason:'end_not_reached'});
 const expectedFuture=new Set(preferred.filter(e=>e.tmdbId&&e.phase==='upcoming'&&!isForeign(e)).map(e=>e.tmdbId!));
 for(const id of expectedFuture)if(!seen.has(id))failures.push({stage:'upcoming',id,reason:'missing_source_title'});
 for(const e of audit.entries.filter(e=>e.tmdbId&&isForeign(e)&&e.phase==='upcoming'))if(!expectedFuture.has(e.tmdbId!)&&seen.has(e.tmdbId!))failures.push({stage:'upcoming_variant',id:e.tmdbId!,reason:'later_dub_presented_as_upcoming'});
 assert.equal((await request('/api/me/settings','PUT',{country:'GB'})).status,200);
 for(const id of ids){
  const r=await request(`/api/title/movie/${id}/releases`);
  if(r.status!==200){failures.push({stage:'country_isolation',id,reason:`HTTP_${r.status}`});continue;}
  const info=(await r.json() as {data:ReleaseInfo}).data;
  if(info.cinema)failures.push({stage:'country_isolation',id,reason:'RO_supplement_in_GB'});
 }
 const report={checkedAt:new Date().toISOString(),sourceEntries:audit.entries.length,uniqueMovieEndpoints:ids.length,currentMovies:listed,upcomingMovies:upcoming,expectedFutureMovies:expectedFuture.size,upcomingUnique:seen.size,pages,latencyMs:{min:Math.min(...timings),max:Math.max(...timings),median:[...timings].sort((a,b)=>a-b)[Math.floor(timings.length/2)]},failures};
 await writeFile('.tooling/cinema-deployment-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(failures.length)process.exitCode=1;
}
main().catch(()=>{console.log('CINEMA_ENDPOINT_AUDIT_FAILED_DETAILS_WITHHELD');process.exitCode=1;}).finally(async()=>{
 if(token){const r=await request('/api/auth/delete-user','POST',{password}).catch(()=>null);console.log(JSON.stringify({testAccountDeleted:r?.status===200}));if(r?.status!==200)process.exitCode=1;}
});
