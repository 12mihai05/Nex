import '../src/env.js';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createClient} from '@libsql/client';
import {drizzle} from 'drizzle-orm/libsql';
import * as schema from '../src/db/schema.js';
import {getConfig} from '../src/config.js';
import {AiService} from '../src/services/ai.js';
import {ChatService} from '../src/services/chat.js';
import {UserRepository} from '../src/repositories/user-repository.js';
import {LiveTmdbRepository} from '../src/repositories/tmdb-repository.js';
import {EpgService} from '../src/services/epg/service.js';
import type {FilterQuery} from '../src/domain/types.js';
import type {OpenAI} from 'openai';

// Synthetic profiles and catalog cache stay in memory. Real TMDB/OpenAI calls.
const client=createClient({url:':memory:'});let stage='setup';
try{
 for(const f of (await readdir(new URL('../drizzle/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort())await client.executeMultiple((await readFile(new URL(`../drizzle/${f}`,import.meta.url),'utf8')).replaceAll('--> statement-breakpoint',''));
 const db=drizzle(client,{schema}),users=new UserRepository(db),ai=new AiService();
 if(process.argv.includes('--editor-diagnostics')){
  const sdk=(ai as unknown as {client:OpenAI}).client;
  const parse=sdk.responses.parse.bind(sdk.responses);
  sdk.responses.parse=((...args:Parameters<typeof parse>)=>{
   const result=parse(...args);
   if(args[0].text?.format?.type==='json_schema'&&args[0].text.format.name==='nex_chat_composition')void result.then(r=>console.log(JSON.stringify({stage:'synthetic-editor-output',parsed:r.output_parsed}))).catch(()=>{});
   return result;
  }) as typeof sdk.responses.parse;
 }
 const compose=ai.compose.bind(ai);
 ai.compose=async(...args)=>{try{return await compose(...args);}catch(error){const e=error as {name?:string;message?:string;status?:number;code?:string;issues?:Array<{code:string;path:unknown[]}>};console.log(JSON.stringify({stage:'composition-diagnostic',name:e.name,status:e.status,code:e.code,missing:e.message==='AI_STRUCTURED_OUTPUT_MISSING',schema:e.message?.includes('schema'),unsupported:e.message?.includes('Unsupported'),length:e.message?.length,issues:e.issues?.map(i=>({code:i.code,path:i.path}))}));throw error;}};
 assert.equal(ai.mode,'live');
 const tmdbToken=getConfig().TMDB_READ_ACCESS_TOKEN;assert.ok(tmdbToken);
 const catalog=new LiveTmdbRepository(tmdbToken,db),chat=new ChatService(users,catalog,ai,new EpgService(db),{combinedPlanner:process.argv.includes('--combined')});
 await db.insert(schema.user).values({id:'qa',name:'QA',email:'followup@example.test'});
 await users.updateSettings('qa',{country:'RO'});
 await users.replaceServices('qa',[{providerId:8,providerName:'Netflix'},{providerId:119,providerName:'Prime Video'},{providerId:1899,providerName:'Max'},{providerId:337,providerName:'Disney+'}]);
 const request='Could you exclude from my feed asian movies and series like chinese japanese korean nepalese etc but dont exclude russian if you might include it into asia';
 for(let i=0;i<(process.argv.includes('--discovery-only')?0:3);i++){
   stage=`clarification-${i+1}`;const session=await users.createConversation('qa');
   const first=await chat.respond('qa',request,session);console.log(JSON.stringify({stage,first:first.blocks}));assert.ok(first.blocks.some(b=>b.type==='text'));assert.ok(!first.blocks.some(b=>b.type==='confirmation'));
   const reply=await chat.respond('qa','Yes coproductions remain eligible',session);
   console.log(JSON.stringify({stage,reply:reply.blocks}));assert.ok(reply.blocks.some(b=>b.type==='confirmation'));
   stage=`scope-${i+1}`;
   assert.ok((await users.getTaste('qa')).some(s=>s.exclude&&s.conditions?.some(c=>c.dimension==='country'&&c.match==='only'&&!c.values.includes('RU'))));
   assert.equal((await users.getTaste('qa')).filter(s=>s.dimension==='combination').length,1);
   const before=JSON.stringify(await db.select().from(schema.userTastePreferences));
   stage=`confusion-${i+1}`;
   const confusion=await chat.respond('qa','What',session);console.log(JSON.stringify({stage,reply:confusion.blocks}));assert.ok(!confusion.blocks.some(b=>b.type==='confirmation'));
   assert.equal(JSON.stringify(await db.select().from(schema.userTastePreferences)),before);
   console.log(JSON.stringify({stage,passed:true}));
 }
 stage='wallflower';
 // Deliberately strong racing taste must not override this session's request.
 await users.upsertTaste('qa',[{dimension:'keyword',key:'car race',score:1,confidence:1,evidenceCount:10,source:'chat_explicit',statement:'I love car racing films'}]);
 const session=await users.createConversation('qa');
 await chat.respond('qa','Now something different how would you describe the movie and theme and the feeling that it gives the watcher of the movie the perks of being a wallflower',session);
 const started=performance.now();
 const result=await chat.respond('qa','Could you give me some movie recomandations that will let me with the same feeling?',session);
 const movies=result.blocks.flatMap(b=>b.type==='movie_carousel'?b.items:[]);
 const context=await users.getSessionContext('qa',session);
 console.log(JSON.stringify({stage,ms:Math.round(performance.now()-started),filters:context.filter,titles:movies.map(m=>m.title),reply:result.blocks.flatMap(b=>'content'in b?[b.content]:[])}));
 assert.ok(movies.length>0);assert.ok(!movies.some(m=>/fast (?:five|& furious)|furious 7|Life on Our Planet|Long Pond Studio/i.test(m.title)));
 assert.ok(JSON.stringify(context.filter).toLowerCase().includes('wallflower'));
 const seen=new Set(movies.map(m=>`${m.mediaType}:${m.id}`));
 for(const prompt of ['Other recommendations','Give me some more options with that same feeling']){
   stage='non-repeating-continuation';const start=performance.now();
   const next=await chat.respond('qa',prompt,session);
   const titles=next.blocks.flatMap(b=>b.type==='movie_carousel'?b.items:[]);
   const current=(await users.getSessionContext('qa',session)).filter as FilterQuery;
   console.log(JSON.stringify({stage,ms:Math.round(performance.now()-start),titles:titles.map(m=>m.title),filters:current,reply:next.blocks.flatMap(b=>'content'in b?[b.content]:[])}));
   assert.equal(current.similarTo,(context.filter as FilterQuery).similarTo);
   assert.ok(titles.length>0);
   for(const item of titles){const key=`${item.mediaType}:${item.id}`;assert.ok(!seen.has(key));seen.add(key);}
   assert.ok(!titles.some(m=>/fast (?:five|& furious)|furious 7/i.test(m.title)));
   console.log(JSON.stringify({stage,ms:Math.round(performance.now()-start),titles:titles.map(m=>m.title),filters:current,passed:true}));
 }
 stage='discovery-refinement';
 const previous=context.filter as FilterQuery;
 const refined=await ai.parseIntent('Same feeling but under 110 minutes',previous,{history:await users.recentConversationMessages('qa',session)});
 console.log(JSON.stringify({stage,refined}));
 // Both the strict integer interpretation (<110) and conventional inclusive
 // runtime cap (<=110) are valid here; neither may loosen the requested bound.
 assert.ok([109,110].includes(refined.maxRuntimeMinutes!));assert.equal(refined.similarTo,previous.similarTo);
 const reset=await ai.parseIntent('Forget that film and feeling. A tense mystery instead, no time limit.',refined,{history:await users.recentConversationMessages('qa',session)});
 console.log(JSON.stringify({stage,reset}));
 assert.equal(reset.similarTo,null);assert.equal(reset.maxRuntimeMinutes,null);assert.ok(reset.genres.some(g=>g.toLowerCase()==='mystery'));
 console.log(JSON.stringify({stage,passed:true}));
 stage='routing-boundaries';
 for(const [message,expected] of [
   ['What do you mean by co-productions?','conversation'],
   ['I was joking, do not save that','preference'],
   ['Only tonight, something cheerful instead','discovery'],
   ['Add the second one to my watchlist','action'],
   ['Who plays the lead in that film?','knowledge'],
   ['Can you explain how my Taste affects Home?','conversation'],
   ['Write a cake recipe inspired by that film','out_of_scope'],
 ] as const){
   const history=message.includes('lead')?[{role:'user',content:'Tell me about The Perks of Being a Wallflower'},{role:'assistant',content:'It is a coming-of-age drama.'}]:[{role:'user',content:request},{role:'assistant',content:'Should international co-productions remain eligible?'}];
   const routed=process.argv.includes('--combined')?await ai.planChat(message,history,{history}):await ai.routeChat(message,history,{});
   console.log(JSON.stringify({stage,message,expected,actual:routed?.route,reply:routed?.reply}));
   // Both explanation and preference no-op are valid for withdrawal.
   assert.ok(routed?.route===expected||(message.includes('joking')&&routed?.route==='conversation'));
 }
 console.log(JSON.stringify({passed:true,realProfilesChanged:false}));
}catch{console.log(JSON.stringify({failedStage:stage,detailsWithheld:true}));process.exitCode=1;}
finally{client.close();}
