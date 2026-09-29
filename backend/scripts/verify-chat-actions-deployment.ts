import '../src/env.js';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {localClockTime} from '../src/services/tv-window.js';

// Disposable-user HTTP journey. Never log credentials, bodies, or raw SDK errors.
const base='https://nex-three-omega.vercel.app';
const password=randomUUID()+randomUUID();
let token:string|null=null,stage='signup',sessionId:string|undefined;
type Block={type:string;content?:string;actions?:string[];action?:Record<string,unknown>;status?:string;items?:Record<string,unknown>[]};
async function request(path:string,method='GET',body?:unknown){
 return fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{'X-Nex-Invite':process.env.NEX_INVITE_CODE??''})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(120000)});
}
async function data(path:string){const r=await request(path);assert.equal(r.status,200);return (await r.json() as {data:Record<string,unknown>[]}).data;}
async function chat(message:string){const started=Date.now();const r=await request('/api/chat','POST',{message,...(sessionId?{sessionId}:{})});console.log(JSON.stringify({stage,httpStatus:r.status,milliseconds:Date.now()-started}));assert.equal(r.status,200);const body=await r.json() as {data:{sessionId:string;blocks:Block[]}};sessionId=body.data.sessionId;return body.data.blocks;}
function confirm(blocks:Block[]){const action=blocks.flatMap(b=>b.actions??[]).find(a=>a.startsWith('Confirm changes '));if(!action){const text=blocks.map(b=>b.content??'').join(' ');console.log(JSON.stringify({stage,proposalMissing:true,parserUnavailable:text.includes('safely read'),catalogMissing:text.includes('no exact catalog'),catalogFailed:text.includes('lookup failed'),ambiguous:text.includes('ambiguous'),countMismatch:text.includes('account for every'),epgMissing:text.includes('could not verify'),epgAmbiguous:text.includes('More than one'),epgUnavailable:text.includes('could not load'),past:text.includes('already passed'),unsupportedCountry:text.includes('not configured')}));}assert.ok(action);return action;}
function passed(){console.log(JSON.stringify({stage,passed:true}));}
try{
 const r=await request('/api/auth/sign-up/email','POST',{name:'Chat Action QA',email:`nex-chat-${randomUUID()}@example.test`,password});assert.equal(r.status,200);token=r.headers.get('set-auth-token');assert.ok(token);
 assert.equal((await request('/api/me/settings','PUT',{country:'RO',timezone:'Europe/Bucharest',remindersEnabled:true})).status,200);
 if(!process.argv.includes('--reminder-only')){
 stage='taste-capability';
 const help=await chat('if i tell you in here what i like and what not will you be able to change my taste?');
 assert.ok(help.some(b=>b.content?.startsWith('Yes.')));assert.equal((await data('/api/me/taste')).length,0);passed();
 stage='precise-protv-time';
 const tvAnswer=await chat('what is today at 8pm on protv');
 const broadcasts=tvAnswer.find(b=>b.type==='tv_carousel')?.items??[];
 assert.ok(broadcasts.length);
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const at=localClockTime(day,20,0,'Europe/Bucharest');
 assert.ok(broadcasts.every(p=>/^pro\s*tv(?: hd)?$/i.test((p.channel as {name:string}).name)&&Date.parse(String(p.startAt))<=+at&&Date.parse(String(p.endAt))>+at));passed();
 stage='lasting-taste-update';
 const tasteReply=await chat('I generally love underdog stories, but I strongly dislike gore.');assert.ok(tasteReply.some(b=>b.type==='confirmation'));
 const taste=await data('/api/me/taste');assert.ok(taste.some(t=>t.key==='underdog'&&Number(t.score)>0));assert.ok(taste.some(t=>t.key==='gore'&&Number(t.score)<0));passed();
 stage='real-tmdb-ai-preview';
 const preview=await chat('Please update these movies: Add Inception (2010) and Arrival (2016, movie, TMDB ID 329865) to my watchlist only. Mark The Matrix (1999) seen and super like. Rate Interstellar (2014) meh without changing Seen or watchlist.');
 const command=confirm(preview);assert.ok(preview.some(b=>b.content?.includes('4 titles')));
 const cards=preview.find(b=>b.type==='library_changes');assert.equal(cards?.status,'preview');assert.equal(cards?.items?.length,4);assert.ok(cards?.items?.every(i=>typeof i.posterUrl==='string'&&Array.isArray(i.changes)&&i.changes.length));
 for(const path of ['watchlist','history','feedback'])assert.equal((await data(`/api/me/${path}`)).length,0);passed();
 stage='atomic-confirm';assert.ok((await chat(command)).some(b=>b.content?.includes('Saved 4 of 4')));
 const saved=await data('/api/me/watchlist'),seen=await data('/api/me/history'),ratings=await data('/api/me/feedback');
 assert.deepEqual(saved.map(i=>i.tmdbId).sort(),[27205,329865].sort());assert.deepEqual(seen.map(i=>i.tmdbId),[603]);
 assert.equal(ratings.find(i=>i.tmdbId===603)?.reaction,'super_like');assert.equal(ratings.find(i=>i.tmdbId===157336)?.reaction,'meh');assert.equal(ratings.length,2);passed();
 stage='repeat-confirm';await chat(command);assert.deepEqual(await data('/api/me/watchlist'),saved);assert.deepEqual(await data('/api/me/history'),seen);assert.deepEqual(await data('/api/me/feedback'),ratings);passed();
 stage='clear-one-field';const clear=confirm(await chat('Clear the rating for the movie The Matrix (1999), but keep its Seen flag unchanged.'));await chat(clear);
 assert.equal((await data('/api/me/history')).length,1);assert.equal((await data('/api/me/feedback')).length,1);passed();
 stage='cancel-proposal';const cancel=confirm(await chat('Remove the movie Inception (2010) from my watchlist.')).replace('Confirm changes','Cancel changes');await chat(cancel);assert.equal((await data('/api/me/watchlist')).length,2);passed();
 }
 stage='live-epg-reminder';
 const tv=await data('/api/tv/window?bucket=later');
 const candidate=tv.find(p=>Date.parse(String(p.startAt))>Date.now()+3600000);
 if(!candidate){console.log(JSON.stringify({stage,skipped:true,reason:'No future EPG entry available in the returned country window'}));}
 else{
  const channel=(candidate.channel as {name:string}).name,start=new Date(String(candidate.startAt));
  console.log(JSON.stringify({stage,publicListing:{title:candidate.title,channel,startAt:start.toISOString()}}));
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(start);
  const time=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Bucharest',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(start);
  const proposal=await chat(`Create a reminder 15 minutes before the programme ${JSON.stringify(candidate.title)} on channel ${JSON.stringify(channel)} on ${date} around ${time} in Romania.`);
  const reminderCommand=confirm(proposal);assert.equal((await data('/api/me/reminders')).length,0);
  const blocks=await chat(reminderCommand);assert.ok(blocks.some(b=>b.action?.type==='setReminder'));
  const reminders=await data('/api/me/reminders');assert.equal(reminders.length,1);assert.equal(reminders[0]!.epgProgramId,candidate.id);assert.equal(reminders[0]!.offsetMinutes,15);assert.equal(Date.parse(String(reminders[0]!.notifyAt)),+start-15*60000);passed();
  stage='cancelled-reminder-not-recreated';assert.equal((await request(`/api/me/reminders/${reminders[0]!.id}`,'DELETE')).status,204);
  assert.ok(!(await chat(reminderCommand)).some(b=>b.action?.type==='setReminder'));assert.equal((await data('/api/me/reminders')).length,0);passed();
 }
}catch{console.log(JSON.stringify({stage,passed:false,details:'Sensitive response details suppressed'}));process.exitCode=1;}
finally{if(token){try{assert.equal((await request('/api/auth/delete-user','POST',{password})).status,200);assert.equal((await request('/api/me/settings')).status,401);console.log(JSON.stringify({testAccountDeleted:true,sessionRevoked:true}));}catch{console.log(JSON.stringify({cleanupFailed:true}));process.exitCode=1;}}}
