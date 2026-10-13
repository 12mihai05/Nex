import '../src/env.js';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

// Disposable baseline account. Log only timings/counts, never credentials,
// profile values, response bodies or a real user's data.
const base=process.env.NEX_BENCHMARK_URL??'https://nex-three-omega.vercel.app';
const password=randomUUID()+randomUUID();
let token:string|null=null;
const progressive=process.argv.includes('--progressive');
async function request(path:string,method='GET',body?:unknown){
  return fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',
    ...(token?{Authorization:`Bearer ${token}`}:{'X-Nex-Invite':process.env.NEX_INVITE_CODE??''})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(120000)});
}
async function timed(path:string){
  const started=performance.now(),response=await request(path);
  assert.equal(response.status,200);
  const payload=await response.text();
  console.log(JSON.stringify({path,ms:Math.round(performance.now()-started),bytes:Buffer.byteLength(payload)}));
  return JSON.parse(payload);
}
try{
  const signup=await request('/api/auth/sign-up/email','POST',{
    name:'Startup QA',email:`nex-startup-${randomUUID()}@example.test`,password,
  });
  assert.equal(signup.status,200);token=signup.headers.get('set-auth-token');assert.ok(token);
  assert.equal((await request('/api/me/settings','PUT',{country:'RO',timezone:'Europe/Bucharest'})).status,200);
  for(let pass=0;pass<2;pass++){
    const started=performance.now();
    await timed('/api/me/settings');
    const afterSettings=performance.now();
    let home:any,afterLists:number;
    if(progressive){
      const result=await Promise.all([
        timed('/api/discovery?batch=0&firstRows=3&compact=true'),
        Promise.all(['/api/providers','/api/me/watchlist','/api/me/history','/api/me/feedback'].map(timed)),
      ]);
      home=result[0];afterLists=afterSettings;
      assert.equal(home.data.length,3);
      assert.ok(home.data.every((r:any)=>r.items.every((v:any)=>v.item.metadataOnly===true)));
    }else{
      await Promise.all(['/api/providers','/api/me/watchlist','/api/me/history','/api/me/feedback','/api/me/reminders','/api/me/taste'].map(timed));
      afterLists=performance.now();home=await timed('/api/discovery?batch=0');
    }
    console.log(JSON.stringify({pass,mode:progressive?'progressive-baseline-disposable-no-saved-taste':'baseline-disposable-no-saved-taste',
      settingsMs:Math.round(afterSettings-started),parallelListsMs:Math.round(afterLists-afterSettings),
      discoveryMs:Math.round(performance.now()-afterLists),totalMs:Math.round(performance.now()-started),
      rows:home.data.length,items:home.data.reduce((n:number,r:{items:unknown[]})=>n+r.items.length,0)}));
    if(progressive&&pass===0){
      const first=home.data[0].items[0].item;
      const full=await timed(`/api/title/${first.mediaType}/${first.id}`);
      assert.equal(full.data.id,first.id);assert.ok(Array.isArray(full.data.cast));assert.notEqual(full.data.metadataOnly,true);
      const seen=home.data.flatMap((r:any)=>r.items.map((v:any)=>`${v.item.mediaType}:${v.item.id}`));
      const next=await request('/api/discovery','POST',{batch:1,firstRows:3,compact:true,plan:JSON.stringify(home.meta.plan),seen});
      assert.equal(next.status,200);const data=await next.json();assert.equal(data.data.length,6);
      for(const row of data.data)for(const {item} of row.items)assert.ok(!seen.includes(`${item.mediaType}:${item.id}`));
      console.log(JSON.stringify({detailHydration:true,laterRows:data.data.length,crossBatchDuplicates:false}));
    }
  }
}catch{console.error('STARTUP_BENCHMARK_FAILED: details withheld');process.exitCode=1;}
finally{
  if(token){
    const deleted=await request('/api/auth/delete-user','POST',{password}).catch(()=>null);
    console.log(JSON.stringify({testAccountDeleted:deleted?.status===200}));
    if(deleted?.status!==200)process.exitCode=1;
  }
}
