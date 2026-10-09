import '../src/env.js';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import app from '../src/app.js';
import {getConfig} from '../src/config.js';
import {closeDatabase} from '../src/db/client.js';
const base=getConfig().BETTER_AUTH_URL,password=randomUUID()+randomUUID();let token:string|null=null;
async function request(path:string,method='GET',body?:unknown){
 const started=performance.now();
 const init={method,headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{'X-Nex-Invite':getConfig().NEX_INVITE_CODE})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(120000)};
 const r=await (process.argv.includes('--remote')?fetch(base+path,init):app.request(base+path,init));
 console.log(JSON.stringify({path:path.split('?')[0],method,status:r.status,ms:Math.round(performance.now()-started)}));
 return r;
}
let step='signup';
try {
 const signup=await request('/api/auth/sign-up/email','POST',{name:'Synthetic improvement QA',email:`nex-qa-${randomUUID()}@example.test`,password});
 assert.equal(signup.status,200);token=signup.headers.get('set-auth-token');assert.ok(token);
 await request('/api/me/settings','PUT',{country:'RO',timezone:'Europe/Bucharest',remindersEnabled:true});
 let sessionId:string|undefined;
 async function chat(message:string){const r=await request('/api/chat','POST',{message,sessionId});assert.equal(r.status,200);const data=(await r.json()).data;sessionId=data.sessionId;return data.blocks as Array<{type:string;content?:string;citations?:unknown[];items?:unknown[];actions?:string[];action?:{type:string;epgProgramId:string;offsetMinutes:number}}>;}
 step='compound taste';
 const preference=await chat('I dislike Chinese romance movies. I love thoughtful science fiction and stories about friendship.');
 assert.ok(preference.some(b=>b.type==='confirmation'));
 const taste=(await (await request('/api/me/taste')).json()).data as Array<{dimension:string;key:string;score:number;conditions?:unknown[]}>;
 assert.ok(taste.some(t=>t.score<0&&t.dimension==='combination'&&(t.conditions?.length??0)>=2));
 assert.ok(!taste.some(t=>t.score<0&&['country','language','genre'].includes(t.dimension)));
 step='TV guide';
 const start=new Date();start.setUTCMinutes(0,0,0);
 const guide=(await (await request('/api/tv/guide?start='+start.toISOString())).json()).data;
 assert.ok(guide.channels.length>0);assert.ok(guide.channels.some((c:{programs:unknown[]})=>c.programs.length));
 const channel=guide.channels[0];
 assert.equal((await request('/api/me/channel-favorites','PUT',{channelId:channel.id,favorite:true})).status,200);
 const favorite=(await (await request('/api/tv/guide?start='+start.toISOString()+'&favorites=true')).json()).data;
 assert.equal(favorite.channels.length,1);assert.equal(favorite.channels[0].id,channel.id);
 step='broadcast reminder follow-up';
 const candidates=guide.channels as Array<{name:string;programs:Array<{id:string;startAt:string}>}>;
 const future=candidates.flatMap(c=>c.programs.map(p=>({...p,channel:c.name}))).find(p=>Date.parse(p.startAt)>Date.now()+3600000);assert.ok(future);
 const at=new Date(Date.parse(future.startAt)+60000),zone='Europe/Bucharest';
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
 const time=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(at);
 const schedule=await chat(`What is on ${future.channel} at ${time} on ${day}?`);
 const cards=schedule.flatMap(b=>b.type==='tv_carousel'?b.items??[]:[]) as Array<{id:string}>;assert.ok(cards.length);
 const proposal=await chat(`Remind me 15 minutes before ${cards.length===1?'this':'the first programme'}.`);
 const confirm=proposal.flatMap(b=>b.actions??[]).find(a=>a.startsWith('Confirm changes '));assert.ok(confirm);
 assert.equal((await (await request('/api/me/reminders')).json()).data.length,0);
 const saved=await chat(confirm);assert.ok(saved.some(b=>b.action?.type==='setReminder'&&b.action.epgProgramId===cards[0]!.id&&b.action.offsetMinutes===15));
 const reminders=(await (await request('/api/me/reminders')).json()).data;assert.equal(reminders.length,1);
 step='card follow-up';
 const title=await chat('Interstellar');assert.ok(title.some(b=>b.type==='movie_carousel'));
 const knowledge=await chat('Who directed the first movie?');assert.ok(knowledge.some(b=>b.type==='knowledge'));
 const followup=await chat('What else has he been in?');assert.ok(followup.some(b=>b.type==='knowledge'));
 step='current knowledge';
 const current=await chat('Has another season of Severance been announced?');
 assert.ok(current.some(b=>b.type==='knowledge'&&(b.citations?.length??0)>0));
 step='taste removal';
 const trait=taste.find(t=>t.dimension==='combination')!;
 assert.equal((await request('/api/me/taste/entry?'+new URLSearchParams({dimension:trait.dimension,key:trait.key}),'DELETE')).status,204);
 const after=(await (await request('/api/me/taste')).json()).data as typeof taste;
 assert.ok(!after.some(t=>t.dimension===trait.dimension&&t.key===trait.key));
 step='clear context';assert.equal((await request('/api/chat','DELETE')).status,200);
 console.log('PASS: real auth, Turso, scoped Taste, live EPG, TMDB card context, sourced web knowledge and cleanup');
}catch{console.error('FAIL: '+step+' (secret values and raw provider errors withheld)');process.exitCode=1;}
finally{if(token){const r=await request('/api/auth/delete-user','POST',{password}).catch(()=>null);console.log(JSON.stringify({testAccountDeleted:r?.status===200}));if(r?.status!==200)process.exitCode=1;}await closeDatabase();}
