import '../src/env.js';
import {z} from 'zod';
import {AiService} from '../src/services/ai.js';
import {tastePortraitInstructions} from '../src/services/taste-summary.js';
// Synthetic inputs only: no user profile, account, or database reads.
const samples=[
  [{dimension:'genre',key:'science fiction',score:.9},{dimension:'mood',key:'thoughtful',score:.8},{dimension:'genre',key:'horror',score:-.9}],
  [{dimension:'story',key:'friendships healing after betrayal',score:.9},{dimension:'genre',key:'romance',score:-.9,conditions:[{dimension:'country',values:['KR','JP'],match:'only'}]}],
];
try {
 const ai=new AiService();
 for(const [index,signals] of samples.entries()) {
   const result=await ai.structured(z.object({paragraph:z.string().min(20).max(900)}),'taste_portrait',tastePortraitInstructions,signals.map(s=>({...s,source:'chat_explicit',confidence:1})));
   console.log(JSON.stringify({sample:index+1,syntheticSummary:result.paragraph}));
 }
}catch{console.error('SYNTHETIC_SUMMARY_CHECK_FAILED');process.exitCode=1;}
