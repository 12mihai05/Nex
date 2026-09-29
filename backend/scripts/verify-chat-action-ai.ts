import '../src/env.js';
import {AiService} from '../src/services/ai.js';
import assert from 'node:assert/strict';
const ai=new AiService();
if(ai.mode!=='live')throw new Error('LIVE_AI_UNAVAILABLE');
const context={today:'2026-09-29',timezone:'Europe/Bucharest',country:'RO',displayed:[]};
const cases=[
  {name:'explicit-id-resolution',message:'Add Arrival (2016, movie, TMDB ID 329865) to my watchlist only.',check:(p:Awaited<ReturnType<AiService['parseActions']>>)=>{
    assert.equal(p.entries.length,1);assert.equal(p.entries[0]?.tmdbId,329865);assert.equal(p.entries[0]?.mediaType,'movie');assert.ok(p.entries[0]?.sourceText.includes('TMDB ID 329865'));assert.equal(p.unresolved.length,0);
  }},
  {name:'mixed-independent',message:'Add Inception (2010) and Arrival (2016) to my watchlist. Mark The Matrix (1999) seen and super like. Rate Interstellar (2014) meh but do not mark it seen.',check:(p:Awaited<ReturnType<AiService['parseActions']>>)=>{
    assert.equal(p.kind,'library');assert.equal(p.entries.length,4);assert.equal(p.requestedCount,4);assert.equal(p.unresolved.length,0);
    const matrix=p.entries.find(e=>e.title==='The Matrix')!;assert.equal(matrix.seen,'seen');assert.equal(matrix.rating,'super_like');assert.equal(matrix.watchlist,'keep');
    const interstellar=p.entries.find(e=>e.title==='Interstellar')!;assert.equal(interstellar.seen,'keep');assert.equal(interstellar.rating,'meh');
  }},
  {name:'negation',message:'Do not add Inception to my watchlist or change any ratings. Just tell me what it is about.',check:(p:Awaited<ReturnType<AiService['parseActions']>>)=>assert.equal(p.kind,'none')},
  {name:'discovery-not-mutation',message:'I have seen Inception and liked Arrival. Recommend something similar, do not update my library.',check:(p:Awaited<ReturnType<AiService['parseActions']>>)=>assert.equal(p.kind,'none')},
  {name:'named-channel-reminder',message:'I know today on ProTV will be Inception around 8pm. Could you make a reminder 15 minutes before it starts?',check:(p:Awaited<ReturnType<AiService['parseActions']>>)=>{
    assert.equal(p.kind,'reminder');assert.equal(p.reminder?.date,'2026-09-29');assert.equal(p.reminder?.localTime,'20:00');assert.equal(p.reminder?.offsetMinutes,15);assert.equal(p.reminder?.title,'Inception');assert.equal(p.unresolved.length,0);
  }},
  {name:'unsupported-numeric-rating',message:'Rate Inception 8 out of 10 and Arrival 4 stars.',check:(p:Awaited<ReturnType<AiService['parseActions']>>)=>assert.ok(p.unresolved.length)},
  {name:'fifty-item-import',message:'Add every one of these movies to my watchlist only. Do not mark them seen or rate them. One title per line:\n'+Array.from({length:50},(_,i)=>`Film ${String(i+1).padStart(2,'0')} (${2000+i%20})`).join('\n'),check:(p:Awaited<ReturnType<AiService['parseActions']>>)=>{
    assert.equal(p.entries.length,50);assert.equal(p.requestedCount,50);assert.equal(p.unresolved.length,0);
    assert.deepEqual(new Set(p.entries.map(e=>e.title)),new Set(Array.from({length:50},(_,i)=>`Film ${String(i+1).padStart(2,'0')}`)));
    assert.ok(p.entries.every(e=>e.watchlist==='add'&&e.seen==='keep'&&e.rating==='keep'));
  }},
];
for(const test of cases){const started=Date.now();try{const result=await ai.parseActions(test.message,context);test.check(result);console.log(JSON.stringify({case:test.name,passed:true,milliseconds:Date.now()-started}));}
catch{console.log(JSON.stringify({case:test.name,passed:false,details:'Sensitive API details suppressed'}));process.exitCode=1;}}
