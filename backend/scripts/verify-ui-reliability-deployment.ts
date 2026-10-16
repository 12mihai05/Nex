import '../src/env.js';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const base='https://nex-three-omega.vercel.app',password=randomUUID()+randomUUID(),email=`nex-ui-${randomUUID()}@example.test`;
let token:string|null=null,stage='signup';
async function request(path:string,method='GET',body?:unknown){
 return fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{'X-Nex-Invite':process.env.NEX_INVITE_CODE??''})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(120000)});
}
async function data(path:string){const r=await request(path);assert.equal(r.status,200);return (await r.json()).data;}
try {
 const r=await request('/api/auth/sign-up/email','POST',{name:'Disposable UI QA',email,password});assert.equal(r.status,200);token=r.headers.get('set-auth-token');assert.ok(token);
 stage='settings';assert.equal((await request('/api/me/settings','PUT',{country:'RO'})).status,200);
 stage='series-seasons';const series=await data('/api/title/series/1399');assert.ok(series.seasonCount>=8);console.log(JSON.stringify({stage,passed:true}));
 stage='taste-summary';
 assert.equal((await data('/api/me/taste-summary')).paragraph,null);
 assert.equal((await request('/api/me/taste','PUT',{signals:[{dimension:'genre',key:'science fiction',score:.9,confidence:1,evidenceCount:1,source:'explicit_edit'},{dimension:'mood',key:'thoughtful',score:.8,confidence:1,evidenceCount:1,source:'explicit_edit'},{dimension:'genre',key:'horror',score:-.9,confidence:1,evidenceCount:1,source:'explicit_edit'}]})).status,200);
 const generated=await request('/api/me/taste-summary','POST');assert.equal(generated.status,200);const portrait=(await generated.json()).data;
 assert.ok(portrait.paragraph?.length>30);assert.ok(portrait.updatedAt);assert.ok(portrait.nextRefreshAt);
 const repeated=await request('/api/me/taste-summary','POST');assert.equal(repeated.status,200);assert.deepEqual((await repeated.json()).data,portrait);
 assert.equal((await data('/api/me/taste-summary')).paragraph,portrait.paragraph);
 console.log(JSON.stringify({stage,passed:true,syntheticSummary:portrait.paragraph}));
 stage='seen-artwork';assert.equal((await request('/api/me/history','POST',{tmdbId:27205,mediaType:'movie',title:'Inception'})).status,201);
 const history=await data('/api/me/history');assert.ok(history.some((i:{tmdbId:number;posterPath?:string})=>i.tmdbId===27205&&i.posterPath));console.log(JSON.stringify({stage,passed:true}));
 stage='persistent-chat';assert.equal((await request('/api/chat','POST',{message:'What can I do in Nex?'})).status,200);
 const saved=await data('/api/chat');assert.ok(saved.messages.length>=2);assert.ok(saved.sessionId);
 const login=await request('/api/auth/sign-in/email','POST',{email,password});assert.equal(login.status,200);token=login.headers.get('set-auth-token');assert.ok(token);
 const restored=await data('/api/chat');assert.equal(restored.sessionId,saved.sessionId);assert.equal(restored.messages.length,saved.messages.length);console.log(JSON.stringify({stage,passed:true}));
 stage='clear-chat';assert.equal((await request('/api/chat','DELETE')).status,200);assert.equal((await data('/api/chat')).messages.length,0);assert.equal((await data('/api/me/history')).length,1);console.log(JSON.stringify({stage,passed:true}));
 stage='guide-next-day';const start=new Date();const guide=await data('/api/tv/guide?start='+encodeURIComponent(start.toISOString()));assert.ok(guide.channels.length>1);
 assert.ok(Date.parse(guide.coverageEnd)>+start);
 const ids=guide.channels.map((c:{id:string})=>c.id);const future=await data('/api/tv/guide?start='+encodeURIComponent(new Date(+start+24*3600000).toISOString())+'&channelIds='+encodeURIComponent(JSON.stringify(ids)));
 assert.deepEqual(future.channels.map((c:{id:string})=>c.id),ids);const programmes=future.channels.reduce((n:number,c:{programs:unknown[]})=>n+c.programs.length,0);assert.ok(programmes>0);console.log(JSON.stringify({stage,passed:true,channels:ids.length,programmes}));
}catch {console.log(JSON.stringify({stage,passed:false,details:'Sensitive response details suppressed'}));process.exitCode=1;}
finally {if(token){try{assert.equal((await request('/api/auth/delete-user','POST',{password})).status,200);assert.equal((await request('/api/chat')).status,401);console.log(JSON.stringify({testAccountDeleted:true,sessionRevoked:true}));}catch{console.log(JSON.stringify({cleanupFailed:true}));process.exitCode=1;}}}
