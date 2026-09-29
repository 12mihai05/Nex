import '../src/env.js';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const base='https://nex-three-omega.vercel.app';
const password=randomUUID()+randomUUID();
let token:string|null=null,sessionId:string|undefined,stage='signup';
type Program={id:string;title:string;startAt:string;endAt:string;channel:{id:string;name:string}};
type Block={type:string;content?:string;items?:Program[]};
async function request(path:string,method='GET',body?:unknown){return fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{'X-Nex-Invite':process.env.NEX_INVITE_CODE??''})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(120000)});}
async function chat(message:string){const r=await request('/api/chat','POST',{message,sessionId});assert.equal(r.status,200);const data=(await r.json() as {data:{sessionId:string;blocks:Block[]}}).data;sessionId=data.sessionId;return data.blocks;}
async function taste(){const r=await request('/api/me/taste');assert.equal(r.status,200);return (await r.json() as {data:Array<{dimension:string;key:string;score:number}>}).data;}
try{
 const r=await request('/api/auth/sign-up/email','POST',{name:'Chat continuity QA',email:`nex-continuity-${randomUUID()}@example.test`,password});assert.equal(r.status,200);token=r.headers.get('set-auth-token');assert.ok(token);
 assert.equal((await request('/api/me/settings','PUT',{country:'RO',timezone:'Europe/Bucharest'})).status,200);
 stage='antena-1-followups';
 const initial=(await chat('what is on Antena 1 around 8pm tonight')).find(b=>b.type==='tv_carousel')?.items??[];
 assert.equal(initial.length,1);assert.match(initial[0]!.channel.name,/antena\s*1/i);
 const next=(await chat(`after ${initial[0]!.title} what will be`)).find(b=>b.type==='tv_carousel')?.items??[];
 assert.equal(next.length,1);assert.equal(next[0]!.channel.id,initial[0]!.channel.id);assert.ok(Date.parse(next[0]!.startAt)>=Date.parse(initial[0]!.endAt));
 const again=(await chat('and after that?')).find(b=>b.type==='tv_carousel')?.items??[];assert.equal(again.length,1);assert.equal(again[0]!.channel.id,next[0]!.channel.id);assert.ok(Date.parse(again[0]!.startAt)>=Date.parse(next[0]!.endAt));
 console.log(JSON.stringify({stage,passed:true}));
 stage='korean-preference-persistence';
 const reply=await chat("I don't like kpop kdrama or Korean movies and series.");assert.ok(reply.some(b=>b.type==='confirmation'));
 const saved=await taste();assert.ok(saved.some(s=>s.score<0&&s.dimension==='language'&&s.key==='ko'));assert.ok(saved.some(s=>s.score<0&&/k.?pop/i.test(s.key)));
 console.log(JSON.stringify({stage,passed:true}));
 stage='clear-chat';const old=sessionId;
 assert.equal((await fetch(base+'/api/chat',{method:'DELETE'})).status,401);
 assert.equal((await request('/api/chat','DELETE')).status,200);
 assert.equal((await request('/api/chat','POST',{message:'after that?',sessionId:old})).status,404);
 assert.deepEqual((await taste()).map(s=>[s.dimension,s.key,s.score]),saved.map(s=>[s.dimension,s.key,s.score]));
 sessionId=undefined;const fresh=await chat('after Observator what will be');assert.ok(fresh.some(b=>b.content?.includes('Which broadcast')));assert.notEqual(sessionId,old);
 console.log(JSON.stringify({stage,passed:true}));
}catch{console.error(JSON.stringify({stage,passed:false,details:'No sensitive request, token or provider error logged'}));process.exitCode=1;}
finally{if(token){const deleted=await request('/api/auth/delete-user','POST',{password}).catch(()=>null);console.log(JSON.stringify({testAccountDeleted:deleted?.status===200}));if(deleted?.status!==200)process.exitCode=1;}}
