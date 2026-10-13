import '../src/env.js';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createClient} from '@libsql/client';
import {drizzle} from 'drizzle-orm/libsql';
import * as schema from '../src/db/schema.js';
import {UserRepository} from '../src/repositories/user-repository.js';
import {FixtureTmdbRepository} from '../src/repositories/tmdb-repository.js';
import {AiService} from '../src/services/ai.js';
import {EpgService} from '../src/services/epg/service.js';
import {ChatService} from '../src/services/chat.js';

// Real OpenAI routing/planning/answers against a synthetic in-memory account and
// explicitly synthetic schedules. No production profile is read or changed.
const client=createClient({url:':memory:'});let stage='setup';
try{
 for(const f of (await readdir(new URL('../drizzle/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort())await client.executeMultiple((await readFile(new URL(`../drizzle/${f}`,import.meta.url),'utf8')).replaceAll('--> statement-breakpoint',''));
 const db=drizzle(client,{schema}),users=new UserRepository(db),ai=new AiService(),catalog=new FixtureTmdbRepository();
 assert.equal(ai.mode,'live');const epg=new EpgService(db),chat=new ChatService(users,catalog,ai,epg,{combinedPlanner:true});
 const originalPlan=ai.planChat.bind(ai);ai.planChat=async(...args)=>{const result=await originalPlan(...args);console.log(JSON.stringify({stage,route:result.route}));return result;};
 const originalTv=ai.planTv.bind(ai);ai.planTv=async(...args)=>{const result=await originalTv(...args);console.log(JSON.stringify({stage,tvMode:result.mode,clarification:result.clarification}));return result;};
 await db.insert(schema.user).values({id:'qa',name:'Synthetic QA',email:'grounded@example.test'});
 await users.updateSettings('qa',{country:'RO',timezone:'Europe/Bucharest'});
 await users.upsertTaste('qa',[{dimension:'genre',key:'documentary',score:1,confidence:1,evidenceCount:1,source:'chat_explicit',statement:'I love documentaries'}]);
 await db.insert(schema.channels).values(['ppv1','ppv2'].map(id=>({id,sourceId:'fixture',externalId:id,displayName:'Prima Sport '+id.toUpperCase(),country:'RO'})));
 const now=Date.now();await db.insert(schema.epgPrograms).values([
 {id:'off',sourceId:'fixture',sourceProgramId:'off',channelId:'ppv2',title:'Fără Emisie',startAt:new Date(now-3600000),endAt:new Date(now+3600000)},
 {id:'next',sourceId:'fixture',sourceProgramId:'next',channelId:'ppv2',title:'Tennis final',startAt:new Date(now+3600000),endAt:new Date(now+7200000)},
 {id:'doc',sourceId:'fixture',sourceProgramId:'doc',channelId:'ppv1',title:'A history of tennis',category:'documentary',description:'A documentary about the history of tennis.',startAt:new Date(now-3600000),endAt:new Date(now+7200000)},
 ]);
 let session=await users.createConversation('qa');
 async function ask(message:string){const start=performance.now();const result=await chat.respond('qa',message,session);console.log(JSON.stringify({stage,ms:Math.round(performance.now()-start),blocks:result.blocks}));return result.blocks;}
 stage='read Taste';let blocks=await ask('What kind of films do I like, based on my saved Taste?');assert.ok(JSON.stringify(blocks).toLowerCase().includes('documentar'));assert.ok(!blocks.some(b=>b.type==='confirmation'));
 stage='current PPV2';blocks=await ask('What is on Prima Sport PPV2 right now?');assert.deepEqual(blocks.flatMap(b=>b.type==='tv_carousel'?b.items.map(p=>p.id):[]),['off']);
 stage='next PPV2';blocks=await ask('What about on ppv2 whats after what is live now');assert.deepEqual(blocks.flatMap(b=>b.type==='tv_carousel'?b.items.map(p=>p.id):[]),['next']);
 stage='yes clarification';session=await users.createConversation('qa');
 await users.addConversationMessage('qa',session,'user','What about on PPV2, what is after what is live now?');
 await users.addConversationMessage('qa',session,'assistant','Do you want the next program after the current live event on Prima Sport PPV2?');
 blocks=await ask('Yes');assert.deepEqual(blocks.flatMap(b=>b.type==='tv_carousel'?b.items.map(p=>p.id):[]),['next']);
 stage='TV recommendation';session=await users.createConversation('qa');blocks=await ask('What is good on TV right now, based on my taste?');assert.ok(blocks.flatMap(b=>b.type==='tv_carousel'?b.items:[]).some(p=>p.id==='doc'));assert.ok(!JSON.stringify(blocks).includes('Fără Emisie'));
 stage='title on TV';blocks=await ask('Will Interstellar be on TV?');assert.ok(!blocks.some(b=>b.type==='movie_carousel'));assert.ok(JSON.stringify(blocks).includes('available guide'));
 stage='outside scope';blocks=await ask('Write me a cake recipe');assert.ok(!JSON.stringify(blocks).includes('Ingredients'));assert.deepEqual(blocks.map(b=>b.type),['text']);
 assert.equal((await users.getTaste('qa')).length,1);assert.equal((await users.listWatchlist('qa')).length,0);
 console.log(JSON.stringify({liveAiPassed:true,syntheticDataOnly:true,productionAccountUnchanged:true}));
}catch(error){console.log(JSON.stringify({failedStage:stage,errorType:error instanceof Error?error.name:'unknown',detailsWithheld:true}));process.exitCode=1;}
finally{client.close();}
