import '../src/env.js';
import {PersonalizationService,type PersonalizationState} from '../src/services/personalization.js';
import {OpenAiSemanticModel} from '../src/services/semantic-model.js';
import type {SemanticStore} from '../src/repositories/recommendation-store.js';
import {FixtureTmdbRepository} from '../src/repositories/tmdb-repository.js';
import {fixtureCatalog} from '../src/fixtures/catalog.js';
import {filterQuerySchema} from '../src/domain/types.js';

// Tiny live embedding check with synthetic data and an in-memory cache. Does
// not alter a real profile, consume its quota, or print provider response bodies.
try {
  const publicCache=new Map<string,number[]>(),privateCache=new Map<string,unknown>();
  const store:SemanticStore={publicVectors:async keys=>new Map(keys.flatMap(k=>publicCache.has(k)?[[k,publicCache.get(k)!] as const]:[])),putPublic:async entries=>{for(const e of entries)publicCache.set(e.key,e.vector);},privateValue:async(user,key)=>privateCache.get(`${user}:${key}`),putPrivate:async(user,key,value)=>{privateCache.set(`${user}:${key}`,value);}};
  const state:PersonalizationState={country:'RO',timezone:'Europe/Bucharest',ownedProviderIds:[],taste:[{dimension:'story',key:'repairing friendship',meaning:'Estranged friends learning to trust one another again.',score:1,confidence:1,evidenceCount:1,source:'chat_explicit'}],watchedIds:new Set(),watchlistIds:new Set(),watchedKeys:new Set(),watchlistKeys:new Set(),ratedKeys:new Set(),rejectedKeys:new Set(),recentlyShown:new Map(),wantHints:[],seenHints:[],behaviorPersonalization:true,favorites:[],saved:[],recommendationEngine:'semantic'};
  const model=new OpenAiSemanticModel(),catalog=new FixtureTmdbRepository(),query=filterQuerySchema.parse({intent:'DISCOVERY',availabilityScope:'all_providers'});
  const embed=model.embed.bind(model);
  model.embed=async texts=>{try{return await embed(texts);}catch(error){const status=error&&typeof error==='object'&&'status' in error?error.status:undefined;console.log(JSON.stringify({embeddingFailed:true,...(typeof status==='number'?{status}: {})}));throw error;}};
  const titles=fixtureCatalog.slice(0,2);
  const first=await new PersonalizationService(store,catalog,async()=>true,model).prepare(titles,state,'synthetic',query);
  if(first.mode!=='semantic'||first.covered!==2){console.log(JSON.stringify({mode:first.mode,reason:first.reason,covered:first.covered,embedded:first.embedded}));throw Error('LIVE_EMBEDDING_FAILED');}
  const calls=model.usage.embeddingRequests;
  const next=await new PersonalizationService(store,catalog,async()=>false,model).prepare([...titles,{...titles[0]!,id:999999999,overview:'A synthetic previously uncached premise.'}],state,'synthetic',query);
  const unchanged=[...first.personalAdjustments].every(([key,evidence])=>{
    const cached=next.personalAdjustments.get(key);
    return cached?.length===evidence.length&&evidence.every((e,i)=>e.code===cached[i]?.code&&Math.abs(e.weight-cached[i]!.weight)<1e-6);
  });
  if(next.mode!=='semantic'||next.reason!=='budget'||next.covered!==2||model.usage.embeddingRequests!==calls||!unchanged)throw Error('CACHE_REUSE_FAILED');
  console.log(JSON.stringify({liveEmbeddings:true,cachedRankingUnchanged:true,noPaidCallsAfterQuota:true,usage:model.usage}));
}catch(error){console.log(error instanceof Error&&['LIVE_EMBEDDING_FAILED','CACHE_REUSE_FAILED'].includes(error.message)?error.message:'SEMANTIC_VERIFICATION_FAILED');process.exitCode=1;}
