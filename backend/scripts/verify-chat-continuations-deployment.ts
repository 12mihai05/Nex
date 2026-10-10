import '../src/env.js';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {ChatBlock} from '../src/domain/types.js';

const base='https://nex-three-omega.vercel.app',password=randomUUID()+randomUUID();
let token:string|null=null,sessionId:string|undefined,stage='signup';
async function request(path:string,method='GET',body?:unknown){
 return fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{'X-Nex-Invite':process.env.NEX_INVITE_CODE??''})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(120_000)});
}
async function chat(message:string){
 const start=performance.now(),r=await request('/api/chat','POST',{message,sessionId});assert.equal(r.status,200);
 const {data}=await r.json() as {data:{sessionId:string;blocks:ChatBlock[]}};
 if(sessionId)assert.equal(data.sessionId,sessionId);sessionId=data.sessionId;
 console.log(JSON.stringify({stage,ms:Math.round(performance.now()-start),blocks:data.blocks.map(b=>b.type)}));return data.blocks;
}
try{
 const r=await request('/api/auth/sign-up/email','POST',{name:'Continuation QA',email:`nex-continuation-${randomUUID()}@example.test`,password});assert.equal(r.status,200);token=r.headers.get('set-auth-token');assert.ok(token);
 assert.equal((await request('/api/me/settings','PUT',{country:'RO',services:[{providerId:8,providerName:'Netflix'},{providerId:119,providerName:'Prime Video'},{providerId:1899,providerName:'Max'},{providerId:337,providerName:'Disney+'}]})).status,200);
 stage='reference';await chat('Describe the feeling and themes of The Perks of Being a Wallflower.');
 const shown=new Set<string>();
 for(const prompt of ['Recommend movies with the same feeling','Other recommendations','Show all services']){
  stage=prompt;const blocks=await chat(prompt),items=blocks.flatMap(b=>b.type==='movie_carousel'?b.items:[]);
  assert.ok(items.length>0);
  for(const item of items){const key=`${item.mediaType}:${item.id}`;assert.ok(!shown.has(key));shown.add(key);}
  assert.ok(!items.some(i=>/fast (?:five|& furious)|furious 7/i.test(i.title)));
  const pills=blocks.flatMap(b=>b.type==='quick_actions'?b.actions:[]);
  assert.equal(pills.length,new Set(pills).size);
  assert.ok(pills.every(p=>['Other recommendations','Something lighter','Something more intense','Under 90 minutes','Show all services','Movies only','Series only'].includes(p)));
  console.log(JSON.stringify({stage,titles:items.map(i=>i.title),pills,noRepeats:true}));
 }
 for(const path of ['/api/me/taste','/api/me/history','/api/me/feedback','/api/me/watchlist']){const r=await request(path);assert.equal(r.status,200);assert.equal((await r.json() as {data:unknown[]}).data.length,0);}
 console.log(JSON.stringify({productionVerified:true,distinctTitles:shown.size,profileUnchanged:true}));
}catch{console.log(JSON.stringify({failedStage:stage,detailsWithheld:true}));process.exitCode=1;}
finally{if(token){const r=await request('/api/auth/delete-user','POST',{password}).catch(()=>null);console.log(JSON.stringify({testAccountDeleted:r?.status===200}));if(r?.status!==200)process.exitCode=1;}}
