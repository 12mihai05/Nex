import '../src/env.js';
import assert from 'node:assert/strict';
import {AiService} from '../src/services/ai.js';
const ai=new AiService();
try{
 assert.equal(ai.mode,'live');
 const result=await ai.extractTaste("I don't like kpop kdrama or Korean movies and series.",[]);
 // Synthetic text only: no user records, credentials, or raw SDK errors logged.
 console.log(JSON.stringify({case:'korean-dislikes',mode:result.mode,signals:result.signals.map(s=>({dimension:s.dimension,key:s.key,score:s.score}))}));
 assert.ok(result.signals.some(s=>s.score<0&&((s.dimension==='language'&&s.key==='ko')||(s.dimension==='country'&&s.key.toLowerCase()==='kr'))));
 assert.ok(result.signals.some(s=>s.score<0&&/k.?pop/i.test(s.key)));
 console.log('PASS: live extraction preserves Korean-content and K-pop dislikes');
}catch{console.error('FAIL: live taste extraction check (credentials and provider errors withheld)');process.exitCode=1;}
