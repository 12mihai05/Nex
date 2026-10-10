import '../src/env.js';
import {readFile,readdir} from 'node:fs/promises';
import {createClient} from '@libsql/client';
import {drizzle} from 'drizzle-orm/libsql';
import * as schema from '../src/db/schema.js';
import {AiService} from '../src/services/ai.js';
import {ChatService} from '../src/services/chat.js';
import {UserRepository} from '../src/repositories/user-repository.js';
import {FixtureTmdbRepository} from '../src/repositories/tmdb-repository.js';
import {EpgService} from '../src/services/epg/service.js';
import {scoreCandidate} from '../src/services/recommendation.js';
import {fixtureCatalog} from '../src/fixtures/catalog.js';
import {filterQuerySchema} from '../src/domain/types.js';

// Real configured OpenAI, synthetic users in an ephemeral in-memory database.
// No application account/profile is read or changed. Do not log provider errors.
const client=createClient({url:':memory:'});
let stage='setup';
try{
 for(const f of (await readdir(new URL('../drizzle/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort())await client.executeMultiple((await readFile(new URL(`../drizzle/${f}`,import.meta.url),'utf8')).replaceAll('--> statement-breakpoint',''));
 const db=drizzle(client,{schema}),users=new UserRepository(db),ai=new AiService();
 if(ai.mode!=='live')throw Error('NO_LIVE_AI');
 await db.insert(schema.user).values({id:'synthetic',name:'QA',email:'chat-eval@example.test'});
 await users.updateSettings('synthetic',{country:'RO'});
 const catalog=new FixtureTmdbRepository(),chat=new ChatService(users,catalog,ai,new EpgService(db));
 const session=await users.createConversation('synthetic');
 const request='exclude form my feed asian mvoies or series like japanese korean indian chinese nepal singapore etc but not russian if it is in asia';
 for(const [label,message,expected] of [
  ['feed exclusion',request,'preference'],
  ['casual cinema','Why do you think slow-paced films can be so absorbing? I just want to talk, not get recommendations.','conversation'],
  ['app help','How is Seen different from Like in Nex?','conversation'],
  ['temporary mood','No Asian romance tonight, give me a comedy instead.','discovery'],
  ['capability only','Could you learn my preferences as we talk?','conversation'],
  ['recipe','Give me a cake recipe.','out_of_scope'],
  ['disguised recipe','Give me a cake recipe for my movie night.','out_of_scope'],
  ['code','Write Python code to scrape movie websites.','out_of_scope'],
  ['verified facts','Who directed Arrival?','knowledge'],
  ['TV','What follows Observator on Antena 1 tonight?','tv'],
  ['library action','Put Arrival in my watchlist.','action'],
 ] as const){
   stage=label;const started=performance.now();const r=await ai.routeChat(message,[],{});
   console.log(JSON.stringify({scenario:label,expected,actual:r?.route,ms:Math.round(performance.now()-started),pass:r?.route===expected}));
   if(r?.route!==expected)throw Error('ROUTE_MISMATCH');
 }
 stage='multi-turn taste';
 const first=await chat.respond('synthetic',request,session);
 if(first.blocks.some(b=>b.type==='movie_carousel')||(await users.getTaste('synthetic')).length)throw Error('PREMATURE_WRITE');
 const answer=await chat.respond('synthetic','No. Keep co-productions with countries outside that group eligible.',session);
 if(!answer.blocks.some(b=>b.type==='confirmation')||answer.blocks.some(b=>b.type==='movie_carousel'))throw Error('NOT_SAVED');
 const state=await users.getRecommendationState('synthetic');
 const query=filterQuerySchema.parse({intent:'DISCOVERY',availabilityScope:'all_providers'});
 const context={...state,viewerIds:['synthetic'],temporaryMoods:[]};
 for(const [countries,blocked] of [[['JP'],true],[['KR'],true],[['IN'],true],[['CN'],true],[['NP'],true],[['SG'],true],[['RU'],false],[['JP','US'],false],[[],false]] as const){
   const item={...fixtureCatalog[0]!,countries:[...countries]};
   if((scoreCandidate(item,query,context)===null)!==blocked)throw Error('SCOPE_MISMATCH');
 }
 console.log(JSON.stringify({scenario:stage,pass:true,tasteSignals:state.taste.length,coProductionsAllowed:true,russiaAllowed:true,libraryUnchanged:state.watchedKeys.size===0&&state.watchlistKeys.size===0}));
 stage='contextual correction';
 const correction=await chat.respond('synthetic','I want now to change my taste based on what I told you.',session);
 if(correction.blocks.some(b=>b.type==='movie_carousel'))throw Error('CORRECTION_CAROUSEL');
 console.log(JSON.stringify({scenario:stage,pass:true,blocks:correction.blocks.map(b=>b.type)}));
 stage='natural conversation';
 const casual=await chat.respond('synthetic','Sometimes a quiet scene says more than a long speech. What do you think? Not asking for recommendations.',session);
 if(casual.blocks.some(b=>b.type==='movie_carousel'))throw Error('UNREQUESTED_CAROUSEL');
 console.log(JSON.stringify({scenario:stage,pass:true,reply:casual.blocks.flatMap(b=>'content'in b?[b.content]:[])}));
}catch{console.log(JSON.stringify({failedStage:stage,detailsWithheld:true}));process.exitCode=1;}
finally{client.close();}
