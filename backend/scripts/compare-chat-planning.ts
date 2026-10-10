import '../src/env.js';
import assert from 'node:assert/strict';
import {AiService} from '../src/services/ai.js';
import {filterQuerySchema} from '../src/domain/types.js';
import {intentOutputSchema} from '../src/services/chat-intent.js';

// Fresh model requests in both arms. No response/cache reuse or real profiles.
const ai=new AiService();const samples:Array<{variant:string;scenario:string;ms:number;passed:boolean}>=[];
const history=[{role:'user',content:'Describe the feeling of The Perks of Being a Wallflower.'},{role:'assistant',content:'An intimate, bittersweet coming-of-age story about loneliness, friendship and finding belonging.'}];
const filter=filterQuerySchema.parse({intent:'DISCOVERY',similarTo:'The Perks of Being a Wallflower',mediaType:'movie',moods:['intimate','bittersweet'],maxRuntimeMinutes:130,providerIds:[8],excludedKeywords:['gore']});
const scenarios=[
 {name:'same feeling',message:'Recommend movies that leave me with the same feeling',route:'discovery',previous:undefined},
 {name:'other recommendations',message:'Give me other recommendations',route:'discovery',previous:filter},
 {name:'last pill',message:'Show all services',route:'discovery',previous:filter},
 {name:'repeat requested',message:'Show the same recommendations again',route:'discovery',previous:filter},
 {name:'Taste explanation',message:'How does my Taste affect Home?',route:'conversation',previous:filter},
 {name:'temporary mood',message:'No Asian romance tonight, give me a comedy instead',route:'discovery',previous:undefined},
 {name:'permanent preference',message:'Exclude anime from my feed, but not all animation',route:'preference',previous:filter},
 {name:'unrelated',message:'Write a cake recipe for movie night',route:'out_of_scope',previous:filter},
];
try{
 assert.equal(ai.mode,'live');
 for(let round=0;round<2;round++)for(const c of scenarios.filter(s=>!process.argv.includes('--pills-only')||s.name==='last pill')){
   for(const variant of round%2?['combined','separate']:['separate','combined']){
     const context={history,...(c.previous?{filter:c.previous}:{})};const start=performance.now();let passed=false;
     try{
       const result=variant==='combined'?await ai.planChat(c.message,history,context):await ai.routeChat(c.message,history,context);
       const query=result?.route==='discovery'?(variant==='combined'&&'filter'in result?intentOutputSchema.parse(result.filter):await ai.parseIntent(c.message,c.previous,context)):null;
       assert.equal(result?.route,c.route);
       if(['same feeling','other recommendations','last pill','repeat requested'].includes(c.name)){
         assert.equal(query?.similarTo,filter.similarTo);assert.equal(query?.mediaType,'movie');
         if(c.previous){assert.equal(query?.maxRuntimeMinutes,130);assert.ok(query?.excludedKeywords.includes('gore'));}
         if(c.name==='last pill'){assert.equal(query?.availabilityScope,'all_providers');assert.deepEqual(query?.providerIds,[]);}
         else if(c.previous)assert.deepEqual(query?.providerIds,[8]);
         assert.equal(query?.recommendationMode,c.name==='repeat requested'?'repeat':'new');
       }
       passed=true;
     }catch{/* Never print raw provider errors. */}
     const sample={variant,scenario:c.name,ms:Math.round(performance.now()-start),passed};samples.push(sample);console.log(JSON.stringify(sample));
   }
 }
 for(const variant of ['separate','combined']){const rows=samples.filter(s=>s.variant===variant);const times=rows.map(r=>r.ms).sort((a,b)=>a-b);console.log(JSON.stringify({variant,passed:rows.filter(r=>r.passed).length,total:rows.length,medianMs:(times[Math.floor((times.length-1)/2)]!+times[Math.floor(times.length/2)]!)/2}));}
 if(samples.some(s=>!s.passed))process.exitCode=1;
}catch{console.log(JSON.stringify({failed:true,detailsWithheld:true}));process.exitCode=1;}
