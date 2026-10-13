import '../src/env.js';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {ChatBlock,TasteSignal} from '../src/domain/types.js';

// Production verification uses only this disposable account; never inspect an
// existing user's conversations/profile. Tokens and auth payloads stay private.
const base='https://nex-three-omega.vercel.app',password=randomUUID()+randomUUID();
let token:string|null=null,stage='authentication',sessionId:string|undefined;
async function request(path:string,method='GET',body?:unknown){return fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{'X-Nex-Invite':process.env.NEX_INVITE_CODE??''})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(150000)});}
async function ask(message:string){
 const started=performance.now(),response=await request('/api/chat','POST',{message,sessionId});assert.equal(response.status,200);
 const {data}=await response.json() as {data:{sessionId:string;blocks:ChatBlock[]}};sessionId=data.sessionId;
 console.log(JSON.stringify({stage,ms:Math.round(performance.now()-started),reply:data.blocks.filter(b=>'content'in b).map(b=>b.content),titles:data.blocks.flatMap(b=>b.type==='movie_carousel'?b.items.map(i=>i.title):[])}));return data.blocks;
}
async function taste(){const r=await request('/api/me/taste');assert.equal(r.status,200);return (await r.json() as {data:TasteSignal[]}).data;}
try{
 assert.equal((await request('/api/me/taste')).status,401);
 const signup=await request('/api/auth/sign-up/email','POST',{name:'Disposable Chat Capability QA',email:`nex-capabilities-${randomUUID()}@example.test`,password});assert.equal(signup.status,200);token=signup.headers.get('set-auth-token');assert.ok(token);
 assert.equal((await request('/api/me/settings','PUT',{country:'RO'})).status,200);
 assert.equal((await request('/api/me/taste','PUT',{signals:[{dimension:'genre',key:'comedy',score:1,confidence:1,evidenceCount:1,source:'explicit_edit'},{dimension:'genre',key:'horror',score:-1,confidence:1,evidenceCount:1,source:'explicit_edit'}]})).status,200);
 stage='Taste correction preview';let blocks=await ask('Remove only my saved dislike of horror, keep my comedy preference.');
 const command=blocks.flatMap(b=>b.type==='quick_actions'?b.actions:[]).find(a=>a.startsWith('Confirm changes '));assert.ok(command);assert.equal((await taste()).length,2);
 stage='Taste correction commit';blocks=await ask(command);assert.ok(blocks.some(b=>b.type==='confirmation'));assert.deepEqual((await taste()).map(s=>s.key),['comedy']);
 stage='compound TV/settings';blocks=await ask('What is on Antena 1 right now, and which country have I selected in settings?');
 assert.ok(blocks.some(b=>b.type==='tv_carousel'));assert.ok(blocks.some(b=>'content'in b&&/Romania|\bRO\b/i.test(b.content)));
 stage='channel programming';blocks=await ask('What does that channel usually show?');assert.ok(blocks.some(b=>b.type==='knowledge'));
 sessionId=undefined;stage='upcoming releases';blocks=await ask('Show upcoming cinema releases with dates in Romania.');
 const first=blocks.flatMap(b=>b.type==='movie_carousel'?b.items:[]);assert.ok(first.length);
 stage='more upcoming';blocks=await ask('More, keeping the same country and upcoming cinema requirement.');
 const more=blocks.flatMap(b=>b.type==='movie_carousel'?b.items:[]);assert.ok(more.every(i=>!first.some(f=>f.id===i.id)));assert.ok(more.every(i=>i.releaseDate&&i.releaseDate>new Date().toISOString().slice(0,10)));
 console.log(JSON.stringify({productionVerified:true,newTasteConfirmation:true,compoundRead:true,channelSample:true,releaseContinuation:true}));
}catch{console.log(JSON.stringify({failedStage:stage,detailsWithheld:true}));process.exitCode=1;}
finally{if(token){const r=await request('/api/auth/delete-user','POST',{password}).catch(()=>null);const revoked=r?.status===200&&(await request('/api/me/settings')).status===401;console.log(JSON.stringify({testAccountDeleted:r?.status===200,sessionRevoked:revoked}));if(!revoked)process.exitCode=1;}}
