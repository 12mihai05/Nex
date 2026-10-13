import '../src/env.js';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base='https://nex-three-omega.vercel.app',password=randomUUID()+randomUUID();
let token:string|null=null,stage='authentication';
async function request(path:string,method='GET',body?:unknown){return fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{'X-Nex-Invite':process.env.NEX_INVITE_CODE??''})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(120000)});}
try{
 assert.equal((await request('/api/tv/prepare','POST',{})).status,401);
 const signup=await request('/api/auth/sign-up/email','POST',{name:'Disposable EPG QA',email:`nex-epg-${randomUUID()}@example.test`,password});assert.equal(signup.status,200);token=signup.headers.get('set-auth-token');assert.ok(token);
 assert.equal((await request('/api/me/settings','PUT',{country:'RO'})).status,200);
 stage='complete guide';let count=0;const start=new Date().toISOString(),ids=new Set<string>();
 for(let offset=0;offset<10000;offset+=20){
  const r=await request(`/api/tv/guide?start=${encodeURIComponent(start)}&offset=${offset}`);assert.equal(r.status,200);
  const {data}=await r.json() as {data:{channels:Array<{id:string;programs:unknown[]}>;hasMore:boolean;preparation:{state:string}}};
  assert.equal(data.preparation.state,'ready');
  for(const c of data.channels){assert.ok(c.programs.length);assert.ok(!ids.has(c.id));ids.add(c.id);count++;}
  if(!data.hasMore)break;
 }
 assert.ok(count>120);
 stage='idempotent prepare';const prepared=await request('/api/tv/prepare','POST',{});assert.equal(prepared.status,200);assert.equal((await prepared.json() as {data:{state:string}}).data.state,'ready');
 console.log(JSON.stringify({deployedGuideVerified:true,channelsInSixHourWindow:count,noEmptyChannels:true,authenticatedPreparation:true,alreadyLoadedIsReady:true,country:'RO'}));
 if(process.argv.includes('--chat')){
  stage='deployed personal chat';const response=await request('/api/chat','POST',{message:'Which TV country is selected in my settings?'});assert.equal(response.status,200);
  const data=await response.json() as {data:{blocks:Array<{type:string;content?:string}>}};
  assert.ok(data.data.blocks.some(b=>b.type==='text'&&/Romania|\bRO\b/i.test(b.content??'')));
  console.log(JSON.stringify({deployedPersonalChatVerified:true}));
 }
}catch{console.log(JSON.stringify({failedStage:stage,detailsWithheld:true}));process.exitCode=1;}
finally{if(token){const r=await request('/api/auth/delete-user','POST',{password}).catch(()=>null);console.log(JSON.stringify({testAccountDeleted:r?.status===200}));if(r?.status!==200)process.exitCode=1;}}
