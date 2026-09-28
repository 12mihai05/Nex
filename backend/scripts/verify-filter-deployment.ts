import "../src/env.js";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

// Disposable test account only. Never logs credentials, tokens or response bodies.
const base = "https://nex-three-omega.vercel.app";
const password = randomUUID() + randomUUID();
let token: string | null = null;
let created = false;
async function request(path: string, method = "GET", body?: unknown) {
  return fetch(base + path, {method, headers: {Origin: base, "Content-Type":"application/json",
    ...(token ? {Authorization:`Bearer ${token}`} : {}),
    ...(path === "/api/auth/sign-up/email" ? {"X-Nex-Invite":process.env.NEX_INVITE_CODE ?? ""} : {})},
    ...(body === undefined ? {} : {body:JSON.stringify(body)}), signal:AbortSignal.timeout(60000)});
}
try {
  assert.equal((await request("/api/health")).status,200);
  assert.equal((await request("/api/catalog?mediaType=movie")).status,401);
  assert.equal((await request("/api/title/movie/336843/broadcasts")).status,401);
  const signup=await request("/api/auth/sign-up/email","POST",{name:"Nex filter verification",email:`nex-filter-${randomUUID()}@example.test`,password});
  assert.equal(signup.status,200);created=true;
  token=signup.headers.get("set-auth-token");assert.ok(token);
  assert.equal((await request("/api/me/settings","PUT",{country:"RO",services:[{providerId:8,providerName:"Netflix"},{providerId:119,providerName:"Prime Video"},{providerId:1899,providerName:"Max"}]})).status,200);
  const start=Date.now();
  const filtered=await request("/api/catalog?mediaType=movie&minMinutes=60&maxMinutes=90");
  assert.equal(filtered.status,200);
  assert.equal(filtered.headers.get("cache-control"),"private, no-store");
  const result=await filtered.json() as {data:Array<{mediaType:string;runtimeMinutes:number;availability:Array<{owned:boolean;access:string}>}>};
  assert.ok(result.data.length>0);
  assert.ok(result.data.every(i=>i.mediaType==="movie"&&i.runtimeMinutes>=60&&i.runtimeMinutes<=90&&i.availability.some(a=>a.owned&&a.access==="included")));
  console.log(JSON.stringify({deployedFilters:true,results:result.data.length,milliseconds:Date.now()-start,ownedAndWithinRange:true}));
  assert.equal((await request("/api/catalog?mediaType=movie&minMinutes=120&maxMinutes=60")).status,400);
  const home=await request("/api/discovery?mediaType=movie&minMinutes=60&maxMinutes=90");
  assert.equal(home.status,200);
  const homeRows=await home.json() as {data:Array<{items:Array<{item:{mediaType:string;runtimeMinutes:number}}>}>};
  assert.ok(homeRows.data.length>1);
  assert.ok(homeRows.data.every(r=>r.items.every(({item:i})=>i.mediaType==="movie"&&i.runtimeMinutes>=60&&i.runtimeMinutes<=90)));
  assert.equal((await request("/api/tv/window?bucket=live&favorites=true")).status,200);
  console.log(JSON.stringify({filteredHomeShelves:true,rows:homeRows.data.length,tvWindowEndpoint:true}));
  for(const batch of [0,1]) {
    const start=Date.now();
    const response=await request(`/api/discovery?batch=${batch}`);
    assert.equal(response.status,200);
    const payload=await response.json() as {data:unknown[]};
    assert.ok(payload.data.length>0&&payload.data.length<=6);
    console.log(JSON.stringify({deployedBatch:batch,rows:payload.data.length,milliseconds:Date.now()-start}));
  }
  assert.equal((await request('/api/discovery?batch=6')).status,400);
  const broadcasts=await request('/api/title/movie/336843/broadcasts');
  assert.equal(broadcasts.status,200);
  const broadcastData=await broadcasts.json() as {data:Array<{title:string;channel:{name:string};startAt:string;endAt:string}>};
  console.log(JSON.stringify({broadcastLookup:true,listings:broadcastData.data.map(p=>({channel:p.channel.name,title:p.title,start:p.startAt,end:p.endAt}))}));
  const later=await request('/api/tv/window?bucket=later');
  assert.equal(later.status,200);
  const next=(await later.json() as {data:Array<{id:string;startAt:string}>}).data.find(p=>Date.parse(p.startAt)>Date.now()+3600000);
  if(next) {
    const saved=await request('/api/me/reminders','POST',{epgProgramId:next.id,offsetMinutes:17});
    assert.equal(saved.status,201);
    const record=(await saved.json() as {data:{offsetMinutes:number;notifyAt:string;startsAt:string}}).data;
    assert.equal(record.offsetMinutes,17);
    assert.equal(Date.parse(record.startsAt)-Date.parse(record.notifyAt),17*60000);
    console.log(JSON.stringify({customReminderMinutes:17,persistedAndTimeVerified:true}));
  } else {console.log('Custom reminder live test skipped: no future EPG programme in the window.');}
  const search=await request("/api/search?q=The%20Truman%20Show&mode=onboarding");
  assert.equal(search.status,200);
  const titles=await search.json() as {data:Array<{title:string;metadataOnly:boolean}>};
  assert.ok(titles.data.some(i=>i.title==="The Truman Show"&&i.metadataOnly));
  console.log(JSON.stringify({deployedOnboardingSearch:true,invalidRangeRejected:true,unauthenticatedFiltersRejected:true}));
} catch {console.log("Deployment verification failed; sensitive details suppressed.");process.exitCode=1;}
finally {
  if(token) {
    try {
      const deleted=await request("/api/auth/delete-user","POST",{password});
      assert.equal(deleted.status,200);
      assert.equal((await request("/api/catalog?mediaType=movie")).status,401);
      console.log(JSON.stringify({disposableAccountDeleted:true,oldSessionRejected:true}));
    } catch {console.log("Disposable test-account cleanup requires attention; no credentials printed.");process.exitCode=1;}
  } else if(created) {console.log("Test-account cleanup requires attention: signup returned no bearer token.");process.exitCode=1;}
}
