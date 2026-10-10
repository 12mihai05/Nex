import '../src/env.js';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base='https://nex-three-omega.vercel.app',password=randomUUID()+randomUUID();
let token:string|null=null,stage='public authorization';
async function request(path:string,method='GET',body?:unknown){return fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{'X-Nex-Invite':process.env.NEX_INVITE_CODE??''})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(60000)});}
try{
  assert.equal((await request('/api/upcoming')).status,401);
  assert.equal((await request('/api/me/release-settings')).status,401);
  stage='signup';const signup=await request('/api/auth/sign-up/email','POST',{name:'Release QA',email:`nex-release-${randomUUID()}@example.test`,password});assert.equal(signup.status,200);token=signup.headers.get('set-auth-token');assert.ok(token);
  for(const country of ['RO','GB','BG','ES','FR','CH','IT','DE','MD']){
    stage=`upcoming ${country}`;assert.equal((await request('/api/me/settings','PUT',{country})).status,200);
    const start=Date.now();const r=await request('/api/upcoming');assert.equal(r.status,200);const body=await r.json() as {data:Array<{releaseDate:string;releaseCountry:string}>;meta:{country:string;day:string;hasMore:boolean}};
    assert.equal(body.meta.country,country);assert.ok(body.data.every(i=>i.releaseCountry===country&&i.releaseDate>body.meta.day));
    console.log(JSON.stringify({stage,count:body.data.length,hasMore:body.meta.hasMore,ms:Date.now()-start}));
    if(body.meta.hasMore){
      stage=`upcoming pagination ${country}`;
      const next=await request('/api/upcoming?page=2');assert.equal(next.status,200);
      const page=await next.json() as typeof body & {meta:{page:number}};
      assert.equal(page.meta.page,2);assert.equal(page.meta.country,country);
      assert.ok(page.data.every(i=>i.releaseCountry===country&&i.releaseDate>page.meta.day));
    }
  }
  stage='invalid pagination';for(const page of ['0','501','bad'])assert.equal((await request(`/api/upcoming?page=${page}`)).status,400);
  assert.equal((await request('/api/me/settings','PUT',{country:'RO'})).status,200);
  stage='invalid notification inputs';
  assert.equal((await request('/api/me/release-settings','POST',{followSeenSeries:'true'})).status,400);
  stage='notification inbox';
  const inbox=await request('/api/me/notifications');assert.equal(inbox.status,200);
  assert.deepEqual((await inbox.json() as {data:{items:unknown[];hasMore:boolean}}).data,{items:[],hasMore:false});
  assert.equal((await request('/api/me/notifications/ack','POST',{ids:['invalid'],kind:'popup'})).status,400);
  assert.equal((await request('/api/me/notifications/ack','POST',{ids:[randomUUID()],kind:'read'})).status,204);
  assert.equal((await request('/api/me/push-device','POST',{token:'no-remote-push-service'})).status,404);
  stage='upcoming search';const search=await request('/api/search?mode=title&q=Avangers%20Doomsday');assert.equal(search.status,200);const results=await search.json() as {data:Array<{id:number;title:string}>};assert.ok(results.data.some(i=>i.id===1003596));
  stage='release detail';assert.equal((await request('/api/title/movie/1003596/releases')).status,200);
  stage='movie subscription';assert.equal((await request('/api/me/release-subscriptions','POST',{mediaType:'movie',tmdbId:1003596,kind:'cinema',enabled:true})).status,200);
  const details=await request('/api/title/movie/1003596/releases');const payload=await details.json() as {data:{subscriptions:Array<{kind:string;enabled:boolean}>}};assert.ok(payload.data.subscriptions.some(s=>s.kind==='cinema'&&s.enabled));
  assert.equal((await request('/api/me/release-subscriptions','POST',{mediaType:'movie',tmdbId:1003596,kind:'season',enabled:true})).status,400);
  assert.equal((await request('/api/me/release-subscriptions','POST',{mediaType:'movie',tmdbId:1003596,kind:'cinema',enabled:false})).status,200);
  stage='series settings';assert.equal((await request('/api/me/release-settings','POST',{followSeenSeries:true})).status,200);assert.equal((await request('/api/me/release-settings','POST',{followSeenSeries:false})).status,200);
  stage='profile unchanged';for(const path of ['/api/me/taste','/api/me/history','/api/me/feedback','/api/me/watchlist']){const r=await request(path);assert.equal(r.status,200);assert.equal((await r.json() as {data:unknown[]}).data.length,0);}
  console.log(JSON.stringify({productionVerified:true,pushDeliveryTested:false,profileUnchanged:true}));
}catch{console.log(JSON.stringify({failedStage:stage,detailsWithheld:true}));process.exitCode=1;}
finally{if(token){const r=await request('/api/auth/delete-user','POST',{password}).catch(()=>null);console.log(JSON.stringify({testAccountDeleted:r?.status===200}));if(r?.status!==200)process.exitCode=1;}}
