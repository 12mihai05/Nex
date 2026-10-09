import { readFile, writeFile } from 'node:fs/promises';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../src/db/schema.js';
import { UserRepository } from '../src/repositories/user-repository.js';
import { LiveTmdbRepository } from '../src/repositories/tmdb-repository.js';
import { getConfig } from '../src/config.js';
import { AiService } from '../src/services/ai.js';
import { PersonalizationService } from '../src/services/personalization.js';
import { OpenAiSemanticModel } from '../src/services/semantic-model.js';
import { contentItemSchema, filterQuerySchema } from '../src/domain/types.js';
import { rankCandidates } from '../src/services/recommendation.js';

const client=createClient({url:'file:./comparison.db'}),db=drizzle(client,{schema}),users=new UserRepository(db),config=getConfig();
const ai=new AiService(),catalog=new LiveTmdbRepository(config.TMDB_READ_ACCESS_TOKEN!,db),service=new PersonalizationService(users.recommendationStore(),catalog,async()=>true,new OpenAiSemanticModel());
const query=filterQuerySchema.parse({intent:'DISCOVERY',availabilityScope:'all_providers'}),results:any[]=[];
const path=new URL('../../docs/evaluations/real-profile-final.json',import.meta.url);
const cases=[
  {id:'teamwork-without-violence',text:'I like ordinary people solving difficult practical problems together through ingenuity, not stories that glorify violence.'},
  {id:'investigations',text:'I love patient investigations that expose institutional wrongdoing.'},
  {id:'warmth',text:'I like people finding belonging through kindness and shared meals.'},
  {id:'unreliable-reality',text:'I like stories that make me question identity, reality and conflicting memories.'},
  {id:'underdogs',text:'I like people underestimated by others overcoming disadvantages through effort. I do not care about genre.'},
  {id:'moral-conflict',text:'I like difficult ethical choices without easy answers.'},
];
let prior:any[]=[];try{prior=JSON.parse(await readFile(path,'utf8')).cases;}catch{/* First run */}
try {
  const pool=(await db.select().from(schema.tmdbCache)).filter(r=>r.cacheKey.startsWith('title:movie:')).flatMap(row=>{const parsed=contentItemSchema.safeParse(JSON.parse(row.payloadJson));return parsed.success?[parsed.data]:[];});
  for(const c of cases){
    try {
    const userId=`real-extracted-${c.id}`,old=prior.find(r=>r.id===c.id&&r.text===c.text&&r.signals);
    const signals=old?.signals??(await ai.extractTaste(c.text,[])).signals;
    await db.insert(schema.user).values({id:userId,name:'Synthetic real-metadata profile',email:`${userId}@example.test`,emailVerified:false,createdAt:new Date(),updatedAt:new Date()}).onConflictDoNothing();
    await users.clearTaste(userId);await users.upsertTaste(userId,signals);
    const state={...await users.getRecommendationState(userId),recommendationEngine:'semantic' as const},p=await service.prepare(pool,state,userId,query);
    const rank=rankCandidates(pool,query,{...state,...p,viewerIds:[userId],temporaryMoods:[]},12);
    results.push({id:c.id,text:c.text,signals,mode:p.mode,titles:rank.map(r=>({id:r.item.id,title:r.item.title,score:+r.score.toFixed(3),evidence:r.evidence.filter(e=>e.code.startsWith('semantic')||e.code.startsWith('negative'))}))});
    console.log(JSON.stringify({persona:c.id,mode:p.mode,signals:signals.map((s:any)=>({key:s.key,meaning:s.meaning,score:s.score,dimension:s.dimension})),top:rank.slice(0,8).map(r=>r.item.title)}));
    } catch(e) {results.push({id:c.id,status:'unavailable',errorType:e instanceof Error?e.name:'unknown'});console.log(JSON.stringify({persona:c.id,status:'unavailable',type:e instanceof Error?e.name:'unknown'}));}
    await writeFile(path,JSON.stringify({method:'Actual current extraction on cached real TMDB records. Qualitative inspection, not human preference ground truth.',cases:results},null,2));
  }
  await writeFile(path,JSON.stringify({method:'Actual current extraction on cached real TMDB records. Qualitative inspection, not human preference ground truth.',catalogCount:pool.length,cases:results},null,2));
} catch {console.error('Real metadata comparison failed; provider details withheld');process.exitCode=1;}
finally {client.close();}
