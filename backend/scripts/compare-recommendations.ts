import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../src/db/schema.js';
import { getConfig } from '../src/config.js';
import { UserRepository } from '../src/repositories/user-repository.js';
import { FixtureTmdbRepository, LiveTmdbRepository } from '../src/repositories/tmdb-repository.js';
import { filterQuerySchema, type ContentItem } from '../src/domain/types.js';
import { PersonalizationService } from '../src/services/personalization.js';
import { OpenAiSemanticModel } from '../src/services/semantic-model.js';
import { rankCandidates, scoreCandidate, titleKey } from '../src/services/recommendation.js';
import { comparisonCases, comparisonCatalog, signal } from '../tests/fixtures/recommendation-cases.js';

// Only synthetic accounts in a LOCAL database. Never contacts production auth or
// writes to a person's profile. The public cache is bounded and reusable on reruns.
const client=createClient({url:'file:./comparison.db'}), db=drizzle(client,{schema});
const report:Record<string,unknown>={createdAt:new Date().toISOString(),method:'Predefined synopsis pairs; same pool, profile and filters for all arms. Synthetic labels are not human satisfaction.',synthetic:[],realCatalog:[]};
const semanticOnly=process.argv.includes('--semantic-only');
const engines=semanticOnly?['baseline','semantic'] as const:['baseline','semantic','semantic_ai'] as const;
const reportUrl=new URL(`../../docs/evaluations/${semanticOnly?'semantic-final':'recommendation-comparison-large'}.json`,import.meta.url);
try {
  const tables=await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='user'");
  if(!tables.rows.length)for(const name of (await readdir(new URL('../drizzle/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort())await client.executeMultiple((await readFile(new URL(`../drizzle/${name}`,import.meta.url),'utf8')).replaceAll('--> statement-breakpoint',''));
  await client.execute('PRAGMA foreign_keys=ON');
  const config=getConfig();if(!config.OPENAI_API_KEY)throw new Error('NO_OPENAI_CREDENTIAL');
  const users=new UserRepository(db),model=new OpenAiSemanticModel(),catalog=new FixtureTmdbRepository();
  report.modelVersion=model.version;
  const service=new PersonalizationService(users.recommendationStore(),catalog,async()=>true,model);
  const query=filterQuerySchema.parse({intent:'DISCOVERY',availabilityScope:'all_providers',excludeWatched:true});
  const rows:Array<Record<string,unknown>>=[];
  const subset=process.argv.includes('--quick')?comparisonCases.slice(0,3):comparisonCases;
  for(const c of subset) {
    const userId=`comparison-${c.id}`;await db.insert(schema.user).values({id:userId,name:'Synthetic comparison',email:`${userId}@example.test`,emailVerified:false,createdAt:new Date(),updatedAt:new Date()}).onConflictDoNothing();
    // Source truth refreshed, not derived cache, so rerun measures warm behavior too.
    if(!(await users.getTaste(userId)).length)await users.upsertTaste(userId,c.signals);
    const base=await users.getRecommendationState(userId), arms:Record<string,unknown>={};
    for(const engine of engines) {
      const state={...base,recommendationEngine:engine},start=performance.now(),usageBefore={...model.usage};
      const prepared=await service.prepare(comparisonCatalog,state,userId,query);
      const context={...state,...prepared,viewerIds:[userId],temporaryMoods:[]};
      const ranked=rankCandidates(comparisonCatalog,query,context,32);
      const pairs=c.pairs.map(([a,b])=>{const first=scoreCandidate(comparisonCatalog[a-1]!,query,context)!,second=scoreCandidate(comparisonCatalog[b-1]!,query,context)!;return {preferred:comparisonCatalog[a-1]!.title,comparison:comparisonCatalog[b-1]!.title,margin:+(first.score-second.score).toFixed(4),credit:Math.abs(first.score-second.score)<1e-6?.5:Number(first.score>second.score)};});
      const ms=Math.round(performance.now()-start);
      arms[engine]={mode:prepared.mode,reason:prepared.reason,ms,covered:prepared.covered,embedded:prepared.embedded,cacheHits:prepared.cacheHits,pairs,top:ranked.slice(0,8).map(r=>({key:titleKey(r.item),title:r.item.title,score:+r.score.toFixed(3),evidence:r.evidence.filter(e=>e.code.startsWith('semantic'))})),apiCalls:model.usage.embeddingRequests-usageBefore.embeddingRequests+model.usage.reviewRequests-usageBefore.reviewRequests};
    }
    rows.push({id:c.id,preferences:c.signals.map(s=>({meaning:s.meaning,score:s.score,dimension:s.dimension})),arms});
    console.log(JSON.stringify({case:c.id,arms:Object.fromEntries(Object.entries(arms).map(([k,v])=>[k,{mode:(v as any).mode,reason:(v as any).reason,ms:(v as any).ms,pairs:(v as any).pairs.map((p:any)=>p.credit)}]))}));
    report.synthetic=rows;
    await mkdir(new URL('../../docs/evaluations/',import.meta.url),{recursive:true});
    await writeFile(reportUrl,JSON.stringify({...report,usage:model.usage},null,2));
  }
  if(!semanticOnly&&!process.argv.includes('--quick')&&config.TMDB_READ_ACCESS_TOKEN) {
    const tmdb=new LiveTmdbRepository(config.TMDB_READ_ACCESS_TOKEN,db),real:ContentItem[]=[];
    const ids=[329865,157336,603,60308,286217,212778,314365,546554,116149,37165,264660,120467,680,238,278,13,550,289,107,301,489,76203,194,141,129,4935,508442,10681,1585,77338];
    for(let i=0;i<ids.length;i+=3) {
      const found=await Promise.allSettled(ids.slice(i,i+3).map(id=>tmdb.getTitle('movie',id,'RO',[])));
      real.push(...found.flatMap(r=>r.status==='fulfilled'&&r.value?[r.value]:[]));
    }
    report.realCatalogCount=real.length;
    const realService=new PersonalizationService(users.recommendationStore(),tmdb,async()=>true,model),realRows=[];
    const personas=[['teamwork','ordinary people solving difficult practical problems together without glorifying violence'],['institutions','patient investigations exposing institutional wrongdoing'],['belonging','people finding belonging through kindness and shared meals'],['memory','stories that make me question identity and conflicting memories'],['underdogs','people underestimated by others overcoming disadvantages through effort'],['moral-choice','difficult ethical choices without easy answers']];
    for(const [name,meaning] of personas) {
      const userId=`comparison-real-${name}`;await db.insert(schema.user).values({id:userId,name:'Synthetic catalog comparison',email:`${userId}@example.test`,emailVerified:false,createdAt:new Date(),updatedAt:new Date()}).onConflictDoNothing();
      if(!(await users.getTaste(userId)).length)await users.upsertTaste(userId,[signal(meaning!)]);
      const base=await users.getRecommendationState(userId),arms:Record<string,unknown>={};
      for(const engine of ['baseline','semantic','semantic_ai'] as const) {
        const start=performance.now(),state={...base,recommendationEngine:engine},p=await realService.prepare(real,state,userId,query);
        const ranked=rankCandidates(real,query,{...state,...p,viewerIds:[userId],temporaryMoods:[]},8);
        arms[engine]={mode:p.mode,reason:p.reason,ms:Math.round(performance.now()-start),titles:ranked.map(r=>({id:r.item.id,title:r.item.title,score:+r.score.toFixed(3)}))};
      }
      realRows.push({persona:name,preference:meaning,arms});console.log(JSON.stringify({realPersona:name,arms}));
    }
    report.realCatalog=realRows;
  }
  report.usage=model.usage;
  await writeFile(reportUrl,JSON.stringify(report,null,2));
  console.log(JSON.stringify({complete:true,usage:model.usage}));
} catch (e) {console.error(JSON.stringify({complete:false,reason:e instanceof Error && e.message==='NO_OPENAI_CREDENTIAL'?'missing OpenAI key':'comparison interrupted; provider details withheld'}));process.exitCode=1;}
finally {client.close();}
