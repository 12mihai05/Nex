import "../src/env.js";
import {readFile} from "node:fs/promises";
import {createTmdbRepository} from "../src/repositories/tmdb-repository.js";
import {generateCandidates} from "../src/services/candidates.js";
import {rankCandidates} from "../src/services/recommendation.js";
import {AiService} from "../src/services/ai.js";
import {filterQuerySchema} from "../src/domain/types.js";
import {closeDatabase} from "../src/db/client.js";

// Only synthetic prompts and public catalog metadata. No users or auth tokens.
try {
  const report=JSON.parse(await readFile(".tooling/verification/personas-tv-want-final-2.json","utf8"));
  const record=report.records.find((r:any)=>r.id==="identity_memory");
  const query=filterQuerySchema.parse(record.turns[1].filter);
  const state:any={country:"RO",ownedProviderIds:[8,1899],taste:record.signals.map((s:any)=>({...s,confidence:.75,evidenceCount:1,source:"onboarding"})),favorites:[],saved:[],watchedIds:new Set(),watchlistIds:new Set(),watchedKeys:new Set(),watchlistKeys:new Set(),ratedKeys:new Set(),rejectedKeys:new Set(),recentlyShown:new Map([...record.browse,...record.turns[0].items].map((i:any)=>[`${i.type}:${i.id}`,Date.now()]))};
  const candidates=await generateCandidates(createTmdbRepository(),state,query);
  const ranked=rankCandidates(candidates,query,{...state,viewerIds:[],temporaryMoods:[]},12);
  console.log(JSON.stringify({retrieved:candidates.length,eligible:ranked.length,ranked:ranked.map(r=>({key:`${r.item.mediaType}:${r.item.id}`,title:r.item.title,runtime:r.item.runtimeMinutes,reason:r.reason,overview:r.item.overview,keywords:r.item.keywords}))}));
  const ai=new AiService();
  for(const mode of ["message_only","resolved_context"]){
    const result=await ai.compose(record.turns[1].message,ranked,true,mode==="resolved_context"?query:undefined);
    console.log(JSON.stringify({mode,...result}));
  }
} catch {console.error("IDENTITY_DIAGNOSTIC_FAILED: details suppressed");process.exitCode=1;}
finally {await closeDatabase();}
