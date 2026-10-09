import { readFile, writeFile } from 'node:fs/promises';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../src/db/schema.js';
import { UserRepository } from '../src/repositories/user-repository.js';
import { FixtureTmdbRepository } from '../src/repositories/tmdb-repository.js';
import { AiService } from '../src/services/ai.js';
import { OpenAiSemanticModel } from '../src/services/semantic-model.js';
import { PersonalizationService } from '../src/services/personalization.js';
import { rankCandidates, scoreCandidate } from '../src/services/recommendation.js';
import { comparisonCases, comparisonCatalog } from '../tests/fixtures/recommendation-cases.js';
import { filterQuerySchema } from '../src/domain/types.js';

const path=new URL('../../docs/evaluations/extracted-profile-final-large.json',import.meta.url);
const client=createClient({url:'file:./comparison.db'}),db=drizzle(client,{schema}),users=new UserRepository(db);
const ai=new AiService(),model=new OpenAiSemanticModel(),service=new PersonalizationService(users.recommendationStore(),new FixtureTmdbRepository(),async()=>true,model);
const query=filterQuerySchema.parse({intent:'DISCOVERY',availabilityScope:'all_providers'}),cases:Array<Record<string,any>>=[];
let prior:Array<Record<string,any>>=[];
try{prior=JSON.parse(await readFile(path,'utf8')).cases;}catch{/* First run. */}
try {
  for(const c of comparisonCases) {
    const description=c.signals.map(s=>`${s.score>0?'I like':'I dislike'} ${s.meaning||s.key}.`).join(' ');
    // Reusing a whole result is explicitly opt-in: otherwise a changed ranker/model
    // must actually be exercised, not silently reported from a previous run.
    const existing=process.argv.includes('--reuse-results')?prior.find(r=>r.id===c.id&&r.description===description&&r.status==='ok'):undefined;if(existing){cases.push(existing);continue;}
    const start=performance.now(),userId=`extracted-${c.id}`;
    try {
      const extraction=await ai.extractTaste(description,[]);
      if(extraction.mode!=='live'||!extraction.signals.length)throw new Error('NO_EXTRACTED_TASTE');
      await db.insert(schema.user).values({id:userId,name:'Synthetic extracted profile',email:`${userId}@example.test`,emailVerified:false,createdAt:new Date(),updatedAt:new Date()}).onConflictDoNothing();
      await users.clearTaste(userId);await users.upsertTaste(userId,extraction.signals);
      const state={...await users.getRecommendationState(userId),recommendationEngine:'semantic' as const};
      const p=await service.prepare(comparisonCatalog,state,userId,query);if(p.mode!=='semantic')throw new Error('SEMANTIC_UNAVAILABLE');
      const context={...state,...p,viewerIds:[userId],temporaryMoods:[]};
      const pairs=c.pairs.map(([a,b])=>{const first=scoreCandidate(comparisonCatalog[a-1]!,query,context)!,second=scoreCandidate(comparisonCatalog[b-1]!,query,context)!;return {preferred:comparisonCatalog[a-1]!.title,comparison:comparisonCatalog[b-1]!.title,margin:+(first.score-second.score).toFixed(4),credit:Math.abs(first.score-second.score)<1e-6?.5:Number(first.score>second.score)};});
      cases.push({id:c.id,status:'ok',description,ms:Math.round(performance.now()-start),signals:state.taste.map(s=>({dimension:s.dimension,key:s.key,meaning:s.meaning,statement:s.statement,score:s.score,conditions:s.conditions})),pairs,top:rankCandidates(comparisonCatalog,query,context,8).map(r=>({title:r.item.title,score:+r.score.toFixed(3)}))});
      console.log(JSON.stringify({case:c.id,newExtractedPairs:pairs.map(p=>p.credit)}));
    } catch {cases.push({id:c.id,status:'unavailable',description});console.log(JSON.stringify({case:c.id,status:'unavailable'}));}
    await writeFile(path,JSON.stringify({method:'Current live extractor → persisted Taste → semantic ranking. Exact same statements and labeled pairs as frozen legacy extraction.',cases},null,2));
  }
  await writeFile(path,JSON.stringify({method:'Current live extractor → persisted Taste → semantic ranking. Exact same statements and labeled pairs as frozen legacy extraction.',cases},null,2));
} finally {client.close();}
