import '../src/env.js';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import type {ChatBlock,TasteSignal} from '../src/domain/types.js';
import type {z} from 'zod';

// Real auth + HTTP route handlers + live AI/TMDB, isolated from all real accounts.
// Never print credentials, auth responses, headers or provider error bodies.
const base='http://localhost:8787';
Object.assign(process.env,{NODE_ENV:'test',VERCEL:'',TURSO_DATABASE_URL:':memory:',TURSO_AUTH_TOKEN:'',
 BETTER_AUTH_URL:base,BETTER_AUTH_SECRET:randomUUID()+randomUUID(),ALLOWED_ORIGINS:base,
 NEX_INVITE_CODE:randomUUID(),EPG_SOURCE_TYPE:'fixture',AI_DAILY_MESSAGE_LIMIT:'100'});
const {getDatabase,closeDatabase}=await import('../src/db/client.js');
const {migrate}=await import('drizzle-orm/libsql/migrator');
const db=getDatabase();await migrate(db,{migrationsFolder:fileURLToPath(new URL('../drizzle/',import.meta.url))});
const {AiService}=await import('../src/services/ai.js');
const originalRouter=AiService.prototype.planChat;
AiService.prototype.planChat=async function(...args){const result=await originalRouter.apply(this,args);console.log(JSON.stringify({stage,route:result.route}));return result;};
const originalPersonal=AiService.prototype.planPersonal;
AiService.prototype.planPersonal=async function(...args){const result=await originalPersonal.apply(this,args);console.log(JSON.stringify({stage,personalPlan:result}));return result;};
const originalPersonalAnswer=AiService.prototype.explainPersonal;
AiService.prototype.explainPersonal=async function(...args){console.log(JSON.stringify({stage,syntheticPersonalFacts:args[1]}));return originalPersonalAnswer.apply(this,args);};
const originalStructured=AiService.prototype.structured;
AiService.prototype.structured=async function<T extends z.ZodType>(shape:T,name:string,instructions:string,data:unknown):Promise<z.infer<T>>{
 const result=await originalStructured.call(this,shape,name,instructions,data) as z.infer<T>;
 if(name==='chat_tasks')console.log(JSON.stringify({stage,taskPlan:result}));return result;
};
const {default:app}=await import('../src/app.js');
const schema=await import('../src/db/schema.js');
let token:string|null=null,stage='signup',sessionId:string|undefined;
const password=randomUUID()+randomUUID();
const group=process.argv[2]??'all';
const run=(name:string)=>group==='all'||group===name;
async function request(path:string,method='GET',body?:unknown){
 return app.request(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{'X-Nex-Invite':process.env.NEX_INVITE_CODE!})},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
async function ask(message:string){
 const start=performance.now(),response=await request('/api/chat','POST',{message,sessionId});
 assert.equal(response.status,200,stage+' HTTP');
 const {data}=await response.json() as {data:{sessionId:string;blocks:ChatBlock[]}};sessionId=data.sessionId;
 console.log(JSON.stringify({stage,question:message.replace(/[a-f0-9-]{36}/g,'[confirmation-id]'),ms:Math.round(performance.now()-start),reply:data.blocks.map(b=>
  'content'in b?{type:b.type,text:b.content}:b.type==='movie_carousel'?{type:b.type,titles:b.items.map(i=>i.title)}:b.type==='tv_carousel'?{type:b.type,programmes:b.items.map(i=>({id:i.id,title:i.title,channel:i.channel}))}:b.type==='quick_actions'?{type:b.type,actions:b.actions.map(a=>a.replace(/[a-f0-9-]{36}/g,'[confirmation-id]'))}:{type:b.type})}));
 return data.blocks;
}
async function taste(){const r=await request('/api/me/taste');assert.equal(r.status,200);return (await r.json() as {data:TasteSignal[]}).data;}
const text=(b:ChatBlock[])=>b.map(v=>'content'in v?v.content:'').join('\n');
try{
 assert.ok(process.env.OPENAI_API_KEY&&process.env.TMDB_READ_ACCESS_TOKEN,'Live credentials required');
 const signup=await request('/api/auth/sign-up/email','POST',{name:'Synthetic Chat QA',email:`chat-${randomUUID()}@example.test`,password});
 assert.equal(signup.status,200);token=signup.headers.get('set-auth-token');assert.ok(token);
 assert.equal((await request('/api/me/settings','PUT',{country:'RO',services:[{providerId:8,providerName:'Netflix'},{providerId:119,providerName:'Prime Video'},{providerId:1899,providerName:'Max'},{providerId:337,providerName:'Disney+'}]})).status,200);
 if(run('taste')){
  stage='learn';let blocks=await ask('I generally love mysteries, but I dislike graphic violence. Please remember those preferences.');
  assert.ok(blocks.some(b=>b.type==='confirmation'));assert.ok((await taste()).length>=2);
  stage='read profile';blocks=await ask('What have you learned about my taste?');assert.match(text(blocks),/myster/i);
  const before=await taste();stage='correct preview';blocks=await ask('Remove only my saved dislike of graphic violence, keep mysteries as it is.');
  const action=blocks.flatMap(b=>b.type==='quick_actions'?b.actions:[]).find(a=>a.startsWith('Confirm changes '));assert.ok(action);
  assert.equal((await taste()).length,before.length);stage='confirm correction';blocks=await ask(action);assert.ok(blocks.some(b=>b.type==='confirmation'));
  assert.ok((await taste()).some(s=>/myster/i.test(s.key+' '+s.meaning)));assert.ok((await taste()).length<before.length);
  stage='explain correction';await ask('What is left in my taste now?');
 }
 if(run('tv')){
  const now=Date.now();await db.insert(schema.channels).values({id:'qa-tv',sourceId:'fixture',externalId:'qa-tv',displayName:'Synthetic Cinema',country:'RO'});
  await db.insert(schema.epgPrograms).values(Array.from({length:4},(_,i)=>({id:`qa-${i}`,sourceId:'fixture',sourceProgramId:`qa-${i}`,channelId:'qa-tv',title:i===0?'Fără Emisie':['','Night of Mysteries','A Detective Story','The Last Clue'][i]!,category:i===0?null:'mystery',description:'Synthetic test listing, not a real broadcast.',startAt:new Date(now+(i-1)*3600000),endAt:new Date(now+i*3600000)})));
  sessionId=undefined;stage='channel sample';let blocks=await ask('What does Synthetic Cinema usually show?');assert.match(text(blocks),/myster|detective/i);
  stage='channel next';blocks=await ask('What is on that channel now?');assert.ok(blocks.some(b=>b.type==='tv_carousel'));
  stage='context next';blocks=await ask('And what comes after that?');assert.ok(blocks.flatMap(b=>b.type==='tv_carousel'?b.items:[]).some(i=>i.id==='qa-2'));
  stage='compound reads';blocks=await ask('What is on Synthetic Cinema now, and which country have I selected in my settings?');assert.match(text(blocks),/Romania|\bRO\b/);assert.ok(blocks.some(b=>b.type==='tv_carousel'));
 }
 if(run('releases')){
  sessionId=undefined;stage='upcoming releases';let blocks=await ask('What upcoming films have cinema release dates in Romania?');
  const initial=blocks.flatMap(b=>b.type==='movie_carousel'?b.items.map(i=>i.id):[]);assert.ok(initial.length);
  stage='more releases';blocks=await ask('Show me some more, same country.');
  const more=blocks.flatMap(b=>b.type==='movie_carousel'?b.items:[]);assert.ok(more.every(i=>!initial.includes(i.id)));assert.ok(more.every(i=>i.releaseDate&&i.releaseDate>new Date().toISOString().slice(0,10)));
  stage='series release';blocks=await ask('Has another season of Severance been announced, and does it have a release date?');assert.ok(blocks.some(b=>b.type==='knowledge'));assert.match(text(blocks),/Severance/i);
 }
 if(run('discovery')){
  sessionId=undefined;stage='feeling setup';await ask('Describe the feeling of The Perks of Being a Wallflower (2012), without spoilers.');
  stage='same feeling';let blocks=await ask('Recommend films with that same feeling, not action films. Just for tonight, not a permanent taste change.');
  const first=blocks.flatMap(b=>b.type==='movie_carousel'?b.items:[]);assert.ok(first.length);assert.ok(first.every(i=>!/fast (five|& furious)/i.test(i.title)));
  const saved=await taste();stage='why second';await ask('Why did you recommend the second one?');
  stage='more same feeling';blocks=await ask('Give me other recommendations, keeping the same feeling and restrictions.');
  const more=blocks.flatMap(b=>b.type==='movie_carousel'?b.items:[]);assert.ok(more.length);assert.ok(more.every(i=>!first.some(f=>f.id===i.id&&f.mediaType===i.mediaType)));
  assert.equal((await taste()).length,saved.length);
 }
 if(run('actions')){
  const rows=async(path:string)=>{const r=await request(path);assert.equal(r.status,200);return (await r.json() as {data:Array<Record<string,unknown>>}).data;};
  const confirmation=(blocks:ChatBlock[])=>{const value=blocks.flatMap(b=>b.type==='quick_actions'?b.actions:[]).find(a=>a.startsWith('Confirm changes '));assert.ok(value);return value;};
  sessionId=undefined;stage='library preview';let blocks=await ask('Add Arrival (2016) and Interstellar (2014) to my watchlist.');
  if(!blocks.some(b=>b.type==='quick_actions')){
   // TMDB has two films titled Arrival from 2016. The safe ambiguity response
   // must not save a partial list; resend using the verified identity it shows.
   assert.match(text(blocks),/ambiguous/);assert.equal((await rows('/api/me/watchlist')).length,0);
   stage='resolve library identity';blocks=await ask('Add Arrival (2016, movie, TMDB ID 329865) and Interstellar (2014, movie, TMDB ID 157336) to my watchlist.');
  }
  assert.equal((await rows('/api/me/watchlist')).length,0);stage='library confirm';await ask(confirmation(blocks));
  assert.equal((await rows('/api/me/watchlist')).length,2);
  stage='context Seen preview';blocks=await ask('Mark the first one as seen, but do not rate it.');
  assert.equal((await rows('/api/me/history')).length,0);stage='Seen confirm';await ask(confirmation(blocks));
  assert.equal((await rows('/api/me/history')).length,1);assert.equal((await rows('/api/me/feedback')).length,0);
  stage='read library';blocks=await ask('Have I marked Arrival as seen, and have I rated it?');assert.match(text(blocks),/seen|watched/i);
  assert.equal((await request('/api/me/settings','PUT',{remindersEnabled:true})).status,200);
  const now=Date.now();await db.insert(schema.channels).values({id:'qa-reminder',sourceId:'fixture',externalId:'qa-reminder',displayName:'Synthetic Reminder TV',country:'RO'});
  await db.insert(schema.epgPrograms).values({id:'qa-reminder-film',sourceId:'fixture',sourceProgramId:'qa-reminder-film',channelId:'qa-reminder',title:'Arrival',startAt:new Date(now+2*3600000),endAt:new Date(now+4*3600000)});
  stage='reminder preview';blocks=await ask('Remind me 15 minutes before Arrival on Synthetic Reminder TV today.');
  assert.equal((await rows('/api/me/reminders')).length,0);stage='reminder confirm';await ask(confirmation(blocks));
  const reminders=await rows('/api/me/reminders');assert.equal(reminders.length,1);assert.equal(reminders[0]?.offsetMinutes,15);assert.equal(reminders[0]?.channelName,'Synthetic Reminder TV');
  stage='read reminders';blocks=await ask('Which reminders have I set?');assert.match(text(blocks),/Arrival/);assert.match(text(blocks),/Synthetic Reminder TV/);
 }
 stage='outside scope';const blocks=await ask('Write Python code for a calculator.');assert.ok(!text(blocks).includes('def '));assert.ok(blocks.every(b=>b.type==='text'));
 console.log(JSON.stringify({passed:true,group,liveAI:true,liveTMDBConfigured:true,realAuthAndAppEndpoints:true,epg:'synthetic isolated listings',productionDataTouched:false}));
}catch{console.log(JSON.stringify({failedStage:stage,detailsWithheld:true}));process.exitCode=1;}
finally{
 if(token){const response=await request('/api/auth/delete-user','POST',{password});console.log(JSON.stringify({testAccountDeleted:response.status===200}));if(response.status!==200)process.exitCode=1;}
 await closeDatabase();
}
