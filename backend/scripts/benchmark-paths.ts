import '../src/env.js';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const base=process.env.NEX_BENCHMARK_URL??'https://nex-three-omega.vercel.app';
const local=process.argv.includes('--local')?(await import('../src/app.js')).default:null;
const password=randomUUID()+randomUUID();let token:string|null=null;
async function request(path:string,method='GET',body?:unknown){const init={method,headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{'X-Nex-Invite':process.env.NEX_INVITE_CODE??''})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(120000)};return local?local.request(base+path,init):fetch(base+path,init);}
try{
 const signup=await request('/api/auth/sign-up/email','POST',{name:'Performance QA',email:`nex-bench-${randomUUID()}@example.test`,password});assert.equal(signup.status,200);token=signup.headers.get('set-auth-token');assert.ok(token);
 await request('/api/me/settings','PUT',{country:'RO',timezone:'Europe/Bucharest'});
 if(process.argv.includes('--catalog')){
  let plan:string[]|undefined;const seen=new Set<string>();
  for(let batch=0;batch<6;batch++){
   const started=performance.now(),r=await request('/api/discovery','POST',{batch,...(plan?{plan:JSON.stringify(plan)}:{}),seen:[...seen]});
   assert.equal(r.status,200);const response=await r.json();plan=response.meta.plan;
   const rows=response.data as Array<{id:string;items:Array<{item:{id:number;mediaType:string}}>}>;
   for(const row of rows)for(const {item} of row.items){const key=`${item.mediaType}:${item.id}`;assert.ok(!seen.has(key),'DUPLICATE_HOME_TITLE');seen.add(key);}
   console.log(JSON.stringify({batch,ms:Math.round(performance.now()-started),rows:rows.map(r=>({id:r.id,count:r.items.length})),uniqueTotal:seen.size}));
  }
  const r=await request('/api/surprise','POST',{mediaType:'movie',maxRuntimeMinutes:120});assert.equal(r.status,200);
  const pick=(await r.json()).data;assert.ok(pick.item.runtimeMinutes<=120);console.log('PASS: all Home batches deduplicated; Pick respects duration.');
 }else for(const path of ['/api/search?q=Interstellar&mode=title','/api/search?q=Interstelar&mode=title','/api/tv/window?bucket=live','/api/tv/channels','/api/discovery?batch=0']){
  for(let pass=0;pass<2;pass++){
   const start=performance.now();const response=await request(path);assert.equal(response.status,200);const body=await response.text();let rows=0,items=0;
   try{const data=JSON.parse(body).data;if(Array.isArray(data)){rows=data.length;items=data.reduce((n:number,r:{items?:unknown[]})=>n+(r.items?.length??0),0);}}catch{/* Only aggregate metrics are logged. */}
   console.log(JSON.stringify({path,pass,status:response.status,ms:Math.round(performance.now()-start),bytes:Buffer.byteLength(body),rows,items}));
  }
 }
}catch{console.error('BENCHMARK_FAILED: no credentials or response bodies logged');process.exitCode=1;}
finally{if(token){const r=await request('/api/auth/delete-user','POST',{password}).catch(()=>null);console.log(JSON.stringify({testAccountDeleted:r?.status===200}));if(r?.status!==200)process.exitCode=1;}}
