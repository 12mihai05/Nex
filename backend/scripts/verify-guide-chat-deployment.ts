import '../src/env.js';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {ChatBlock,TasteSignal} from '../src/domain/types.js';

const base='https://nex-three-omega.vercel.app',password=randomUUID()+randomUUID();
let token:string|null=null,stage='signup',sessionId:string|undefined;
async function request(path:string,method='GET',body?:unknown){
 return fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{'X-Nex-Invite':process.env.NEX_INVITE_CODE??''})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(120_000)});
}
async function chat(message:string){
 const started=performance.now(),response=await request('/api/chat','POST',{message,sessionId});assert.equal(response.status,200);
 const {data}=await response.json() as {data:{sessionId:string;blocks:ChatBlock[]}};sessionId=data.sessionId;
 console.log(JSON.stringify({stage,ms:Math.round(performance.now()-started),blocks:data.blocks.map(b=>b.type)}));return data.blocks;
}
try{
 const signup=await request('/api/auth/sign-up/email','POST',{name:'Guide Chat QA',email:`nex-guide-chat-${randomUUID()}@example.test`,password});
 assert.equal(signup.status,200);token=signup.headers.get('set-auth-token');assert.ok(token);
 stage='guide';const start=new Date().toISOString();let total=0;
 for(let offset=0;offset<1000;offset+=20){
   const r=await request(`/api/tv/guide?start=${encodeURIComponent(start)}&offset=${offset}`);assert.equal(r.status,200);
   const {data}=await r.json() as {data:{channels:Array<{programs:unknown[]}>;hasMore:boolean}};
   assert.ok(data.channels.every(c=>c.programs.length>0));total+=data.channels.length;if(!data.hasMore)break;
 }
 assert.ok(total>=100);console.log(JSON.stringify({stage,total,noEmptyChannels:true}));
 stage='preference request';let blocks=await chat('Could you exclude from my feed asian movies and series like chinese japanese korean nepalese etc but dont exclude russian if you might include it into asia');
 assert.ok(!blocks.some(b=>b.type==='movie_carousel'));
 stage='preference clarification';blocks=await chat('Yes coproductions remain eligible');
 assert.ok(blocks.some(b=>b.type==='confirmation'));assert.ok(!blocks.some(b=>b.type==='movie_carousel'));
 const r=await request('/api/me/taste');assert.equal(r.status,200);const {data:taste}=await r.json() as {data:TasteSignal[]};
 assert.ok(taste.some(s=>s.exclude&&s.score<0&&s.conditions?.some(c=>c.dimension==='country'&&c.match==='only'&&!c.values.includes('RU'))));
 stage='casual discussion';blocks=await chat('Sometimes a quiet scene says more than a long speech. What do you think? No recommendations please.');
 assert.deepEqual(blocks.map(b=>b.type),['text']);assert.ok(blocks.every(b=>!('content'in b)||!b.content.includes('\u2014')));
 stage='unrelated task';blocks=await chat('Write Python code for me.');assert.deepEqual(blocks.map(b=>b.type),['text']);
 stage='same feeling setup';
 assert.equal((await request('/api/me/settings','PUT',{country:'RO',services:[{providerId:8,providerName:'Netflix'},{providerId:119,providerName:'Prime Video'},{providerId:1899,providerName:'Max'},{providerId:337,providerName:'Disney+'}]})).status,200);
 sessionId=undefined;
 await chat('Describe the themes and feeling of The Perks of Being a Wallflower.');
 stage='same feeling recommendations';blocks=await chat('Could you give me some movie recomandations that will let me with the same feeling?');
 const movies=blocks.flatMap(b=>b.type==='movie_carousel'?b.items:[]);
 assert.ok(movies.length>0);assert.ok(!movies.some(m=>/fast (?:five|& furious)|furious 7/i.test(m.title)));
 console.log(JSON.stringify({stage,titles:movies.map(m=>m.title)}));
 for(const path of ['/api/me/history','/api/me/feedback','/api/me/watchlist']){const r=await request(path);assert.equal(r.status,200);assert.equal((await r.json() as {data:unknown[]}).data.length,0);}
 console.log(JSON.stringify({productionVerified:true,tastePersisted:true,libraryUnchanged:true}));
}catch{console.log(JSON.stringify({failedStage:stage,detailsWithheld:true}));process.exitCode=1;}
finally{if(token){const r=await request('/api/auth/delete-user','POST',{password}).catch(()=>null);console.log(JSON.stringify({testAccountDeleted:r?.status===200}));if(r?.status!==200)process.exitCode=1;}}
