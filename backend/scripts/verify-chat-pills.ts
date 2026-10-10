import '../src/env.js';
import assert from 'node:assert/strict';
import {AiService} from '../src/services/ai.js';
import {filterQuerySchema} from '../src/domain/types.js';

const ai=new AiService();let stage='setup';
const history=[{role:'user',content:'Movies with the feeling of The Perks of Being a Wallflower, on Netflix, under 130 minutes, without gore.'},{role:'assistant',content:'These share its intimate, bittersweet coming-of-age feeling.'}];
const filter=filterQuerySchema.parse({intent:'DISCOVERY',similarTo:'The Perks of Being a Wallflower',mediaType:'movie',moods:['intimate','bittersweet'],maxRuntimeMinutes:130,providerIds:[8],excludedKeywords:['gore']});
try{
 assert.equal(ai.mode,'live');
 for(const message of ['Other recommendations','Something lighter','Something more intense','Under 90 minutes','Show all services','Movies only','Series only']){
  stage=message;const result=await ai.planChat(message,history,{history,filter});
  assert.equal(result.route,'discovery');const q=result.filter;assert.ok(q);
  assert.equal(q.similarTo,filter.similarTo);assert.equal(q.recommendationMode,'new');
  assert.ok(q.excludedKeywords.includes('gore'));
  assert.equal(q.mediaType,message==='Series only'?'series':'movie');
  if(message==='Show all services'){assert.equal(q.availabilityScope,'all_providers');assert.deepEqual(q.providerIds,[]);}else assert.deepEqual(q.providerIds,[8]);
  if(message==='Under 90 minutes')assert.ok([89,90].includes(q.maxRuntimeMinutes!));else assert.equal(q.maxRuntimeMinutes,130);
  console.log(JSON.stringify({stage,passed:true}));
 }
}catch{console.log(JSON.stringify({failedStage:stage,detailsWithheld:true}));process.exitCode=1;}
