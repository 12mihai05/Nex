import '../src/env.js';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

// Live providers through the actual API, isolated ephemeral auth/database.
const base='http://localhost:8787';
Object.assign(process.env,{NODE_ENV:'test',VERCEL:'',TURSO_DATABASE_URL:':memory:',TURSO_AUTH_TOKEN:'',
  BETTER_AUTH_URL:base,BETTER_AUTH_SECRET:randomUUID()+randomUUID(),ALLOWED_ORIGINS:base,
  NEX_INVITE_CODE:randomUUID(),EPG_SOURCE_TYPE:'fixture'});
const {getDatabase,closeDatabase}=await import('../src/db/client.js');
const {migrate}=await import('drizzle-orm/libsql/migrator');
await migrate(getDatabase(),{migrationsFolder:fileURLToPath(new URL('../drizzle/',import.meta.url))});
const {default:app}=await import('../src/app.js');
const {PersonalizationService}=await import('../src/services/personalization.js');
const prepare=PersonalizationService.prototype.prepare;
PersonalizationService.prototype.prepare=async function(...args){const start=performance.now();const result=await prepare.apply(this,args);console.log(JSON.stringify({semanticMs:Math.round(performance.now()-start),mode:result.mode,covered:result.covered,reason:result.reason}));return result;};
const password=randomUUID()+randomUUID();let token:string|null=null;
async function request(path:string,method='GET',body?:unknown){return app.request(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{'X-Nex-Invite':process.env.NEX_INVITE_CODE!})},...(body===undefined?{}:{body:JSON.stringify(body)})});}
try{
  const signup=await request('/api/auth/sign-up/email','POST',{name:'Home QA',email:`home-${randomUUID()}@example.test`,password});assert.equal(signup.status,200);token=signup.headers.get('set-auth-token');assert.ok(token);
  assert.equal((await request('/api/me/settings','PUT',{country:'RO',timezone:'Europe/Bucharest',recommendationEngine:'semantic'})).status,200);
  const signals=[
    {dimension:'genre',key:'Mystery',score:.9},
    {dimension:'genre',key:'Comedy',score:.8},
    {dimension:'theme',key:'found family',score:.8},
    {dimension:'country',key:'CN',score:-1,exclude:true},
  ].map(s=>({...s,confidence:1,evidenceCount:1,source:'explicit_edit'}));
  assert.equal((await request('/api/me/taste','PUT',{signals})).status,200);
  let plan:string[]|undefined;const seen=new Set<string>();
  for(let batch=0;batch<7;batch++){
    const started=performance.now();const r=await request('/api/discovery','POST',{batch,firstRows:3,compact:true,...(plan?{plan:JSON.stringify(plan)}:{}),seen:[...seen]});
    assert.equal(r.status,200);const text=await r.text();const data=JSON.parse(text);plan=data.meta.plan;
    assert.ok(data.data.length<=(batch===0?3:6));if(batch===0)assert.equal(data.data.length,3);
    for(const row of data.data)for(const {item} of row.items){const key=`${item.mediaType}:${item.id}`;assert.ok(!seen.has(key),'duplicate across batches');seen.add(key);assert.equal(item.metadataOnly,true);}
    console.log(JSON.stringify({batch,ms:Math.round(performance.now()-started),bytes:Buffer.byteLength(text),rows:data.data.map((r:{id:string;items:unknown[]})=>({id:r.id,count:r.items.length})),hasMore:data.meta.hasMore}));
    if(!data.meta.hasMore)break;
  }
  const legacy=await request('/api/discovery?batch=0');assert.equal(legacy.status,200);assert.ok((await legacy.json()).data.length<=6);
  const invalid=await request('/api/discovery?batch=0&firstRows=2');assert.equal(invalid.status,400);
  console.log(JSON.stringify({legacyCompatible:true,invalidSizeRejected:true,distinctTitles:seen.size}));
}catch{console.error('HOME_DELIVERY_FAILED: provider/private details withheld');process.exitCode=1;}
finally{if(token){const r=await request('/api/auth/delete-user','POST',{password});console.log(JSON.stringify({testAccountDeleted:r.status===200}));}await closeDatabase();}
