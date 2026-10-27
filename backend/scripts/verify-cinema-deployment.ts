import '../src/env.js';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {ReleaseInfo} from '../src/domain/releases.js';
import type {ContentItem} from '../src/domain/types.js';

// Disposable account only. Never print sessions, credentials, or user content.
const base='https://nex-three-omega.vercel.app',password=randomUUID()+randomUUID();
let token:string|null=null,stage='authorization';
async function request(path:string,method='GET',body?:unknown){
  return fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{'X-Nex-Invite':process.env.NEX_INVITE_CODE??''})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(60000)});
}
async function data<T>(path:string):Promise<T>{const r=await request(path);assert.equal(r.status,200);return (await r.json() as {data:T}).data;}
try{
  assert.equal((await request('/api/title/movie/1437511/releases')).status,401);
  assert.equal((await request('/api/upcoming')).status,401);
  stage='signup';const r=await request('/api/auth/sign-up/email','POST',{name:'Cinema QA',email:`nex-cinema-${randomUUID()}@example.test`,password});
  assert.equal(r.status,200);token=r.headers.get('set-auth-token');assert.ok(token);
  assert.equal((await request('/api/me/settings','PUT',{country:'RO'})).status,200);
  const targets=[{id:1437511,date:'2026-11-13'},{id:1170608,date:'2026-12-18'},{id:1003596,date:'2026-12-18'}];
  for(const target of targets){
    stage=`Romanian release ${target.id}`;const start=Date.now();
    const info=await data<ReleaseInfo>(`/api/title/movie/${target.id}/releases`);
    assert.ok(info.cinema?.listings.some(l=>l.date===target.date));
    assert.equal(info.cinema?.country,'RO');
    assert.ok(info.releases.some(r=>r.kind==='cinema'&&r.date===target.date));
    assert.ok(info.cinema.listings.every(l=>l.sourceUrl.startsWith('https://')));
    console.log(JSON.stringify({stage,ms:Date.now()-start,chains:[...new Set(info.cinema.listings.map(l=>l.name))]}));
  }
  stage='Romanian synopsis';const title=await data<ContentItem>('/api/title/movie/1679416');
  assert.ok(title.overview.trim().length>50);assert.equal(title.overviewLanguage,'ro');assert.ok(title.cast.length>0);assert.ok(title.director);
  stage='reissue';const old=await data<ContentItem>('/api/title/movie/299534');assert.equal(old.year,2019);
  const reissue=await data<ReleaseInfo>('/api/title/movie/299534/releases');
  assert.ok(reissue.cinema?.listings.some(l=>l.dateKind==='reissue'));
  assert.ok(!reissue.releases.some(r=>r.kind==='cinema'&&r.date==='2026-09-25'));
  stage='upcoming pagination';const ids=new Set<number>();
  // Read enough pages to cross the imported prefix into normal TMDb results.
  for(let page=1;page<=5;page++){
    const start=Date.now(),response=await request(`/api/upcoming?page=${page}`);assert.equal(response.status,200);
    const payload=await response.json() as {data:ContentItem[];meta:{hasMore:boolean;day:string;country:string}};
    assert.equal(payload.meta.country,'RO');
    for(const item of payload.data){assert.ok(!ids.has(item.id),'duplicate across pages');ids.add(item.id);assert.ok(item.releaseDate&&item.releaseDate>payload.meta.day);assert.equal(item.releaseCountry,'RO');}
    console.log(JSON.stringify({stage,page,count:payload.data.length,ms:Date.now()-start}));
    if(!payload.meta.hasMore)break;
  }
  for(const t of targets)assert.ok(ids.has(t.id),'target missing from upcoming');
  stage='alert toggle';for(const enabled of [true,false]){
    assert.equal((await request('/api/me/release-subscriptions','POST',{mediaType:'movie',tmdbId:1437511,kind:'cinema',enabled})).status,200);
    const info=await data<{subscriptions:Array<{kind:string;enabled:boolean}>}>('/api/title/movie/1437511/releases');
    assert.equal(info.subscriptions.some(s=>s.kind==='cinema'&&s.enabled),enabled);
  }
  stage='country isolation';assert.equal((await request('/api/me/settings','PUT',{country:'GB'})).status,200);
  assert.equal((await data<ReleaseInfo>('/api/title/movie/1437511/releases')).cinema,undefined);
  stage='no unsolicited notification';assert.deepEqual((await data<{items:unknown[]}>('/api/me/notifications')).items,[]);
  stage='no taste changes';for(const path of ['taste','history','feedback','watchlist'])assert.equal((await data<unknown[]>(`/api/me/${path}`)).length,0);
  console.log(JSON.stringify({cinemaEndToEndPassed:true,deviceNotificationsTested:false}));
}catch{console.log(JSON.stringify({failedStage:stage,detailsWithheld:true}));process.exitCode=1;}
finally{
  if(token){const result=await request('/api/auth/delete-user','POST',{password}).catch(()=>null);console.log(JSON.stringify({testAccountDeleted:result?.status===200}));if(result?.status!==200)process.exitCode=1;}
}
