import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../src/db/schema.js';
import { getConfig } from '../src/config.js';
import { LiveTmdbRepository } from '../src/repositories/tmdb-repository.js';
import { OpenAiSemanticModel } from '../src/services/semantic-model.js';
import { cosine, semanticTitleText, unitVector } from '../src/services/semantic-taste.js';
import type { ContentItem } from '../src/domain/types.js';

// The first four pairs diagnose observed failures; the remaining pairs/titles
// were set before fetching the held-out metadata. These are adherence judgments,
// not satisfaction labels. Report missing data instead of counting a pass.
const cases=[
  {id:'food-community',meaning:'People finding belonging through kindness and shared meals',split:'diagnostic',pairs:[[212778,680],[116149,238]]},
  {id:'practical-teamwork',meaning:'Ordinary people collaboratively solving difficult practical problems through ingenuity',split:'diagnostic',pairs:[[60308,550],[286217,107]]},
  {id:'unreliable-reality',meaning:'Stories about uncertain reality and unreliable memories that force the audience to question what really happened',split:'diagnostic',pairs:[[37165,508442],[550,116149]]},
  {id:'institutional-investigation',meaning:'Patient investigations uncovering institutional wrongdoing',split:'diagnostic',pairs:[[314365,286217],[314365,212778]]},
  {id:'team-engineering-holdout',meaning:'Teams solving difficult technical problems through patient ingenuity',split:'holdout',pairs:[[568,245891],[381284,545609],[205596,245891]]},
  {id:'unlikely-family-holdout',meaning:'Lonely outsiders forming a caring chosen family and a sense of belonging',split:'holdout',pairs:[[371645,545609],[346648,245891]]},
  {id:'reasoning-holdout',meaning:'Ordinary people patiently reasoning through evidence to challenge an injustice',split:'holdout',pairs:[[389,545609],[462,245891],[1949,545609]]},
  {id:'memory-holdout',meaning:'Unreliable memories that make the audience question what really happened',split:'holdout',pairs:[[77,257211],[38,10637]]},
  {id:'overcoming-disadvantage-holdout',meaning:'People underestimated by others overcoming disadvantage through effort and cooperation',split:'holdout',pairs:[[10637,245891],[369557,545609]]},
];
const client=createClient({url:'file:./comparison.db'}),db=drizzle(client,{schema}),config=getConfig(),catalog=new LiveTmdbRepository(config.TMDB_READ_ACCESS_TOKEN!,db);
const path=new URL('../../docs/evaluations/embedding-representations.json',import.meta.url),results:any[]=[];
try {
  const ids=[...new Set(cases.flatMap(c=>c.pairs.flat()))],items=new Map<number,ContentItem>();
  for(let i=0;i<ids.length;i+=3){const values=await Promise.allSettled(ids.slice(i,i+3).map(id=>catalog.getTitle('movie',id,'RO',[])));values.forEach(r=>{if(r.status==='fulfilled'&&r.value)items.set(r.value.id,r.value);});}
  const pool=[...items.values()];
  for(const variant of [
    {id:'small-512-tags',model:'text-embedding-3-small',dimensions:512,tags:true},
    {id:'small-512-plot',model:'text-embedding-3-small',dimensions:512,tags:false},
    {id:'small-1536-plot',model:'text-embedding-3-small',dimensions:1536,tags:false},
    {id:'large-1024-plot',model:'text-embedding-3-large',dimensions:1024,tags:false},
    {id:'large-1024-tags',model:'text-embedding-3-large',dimensions:1024,tags:true},
  ]) {
    const model=new OpenAiSemanticModel({...config,OPENAI_EMBEDDING_MODEL:variant.model,OPENAI_EMBEDDING_DIMENSIONS:variant.dimensions}),start=performance.now();
    const documents=[...pool.map(t=>variant.tags?semanticTitleText(t):t.overview.slice(0,2400)),...cases.map(c=>`Story preference: ${c.meaning}`)];
    const vectors=(await model.embed(documents)).map(v=>unitVector(v)!);
    const rows=cases.map((c,i)=>({id:c.id,split:c.split,meaning:c.meaning,pairs:c.pairs.map(([a,b])=>{const ai=pool.findIndex(t=>t.id===a),bi=pool.findIndex(t=>t.id===b);if(ai<0||bi<0)return {preferredId:a,comparisonId:b,status:'missing'};const first=cosine(vectors[pool.length+i]!,vectors[ai]!),second=cosine(vectors[pool.length+i]!,vectors[bi]!);return {preferred:pool[ai]!.title,comparison:pool[bi]!.title,margin:+(first-second).toFixed(4),credit:Math.abs(first-second)<1e-6?.5:Number(first>second),similarityPreferred:+first.toFixed(4),similarityComparison:+second.toFixed(4)};}),top:pool.map((item,j)=>({title:item.title,similarity:cosine(vectors[pool.length+i]!,vectors[j]!)})).sort((a,b)=>b.similarity-a.similarity).slice(0,5)}));
    results.push({...variant,ms:Math.round(performance.now()-start),usage:model.usage,rows});
    console.log(JSON.stringify({variant:variant.id,diagnostic:rows.filter(r=>r.split==='diagnostic').flatMap(r=>r.pairs.map(p=>p.credit??null)),holdout:rows.filter(r=>r.split==='holdout').flatMap(r=>r.pairs.map(p=>p.credit??null))}));
    await mkdir(new URL('../../docs/evaluations/',import.meta.url),{recursive:true});await writeFile(path,JSON.stringify({method:'Embedding similarity only, no genre diversity/quality/rating effects. Predeclared real-metadata diagnostic and held-out pairs.',catalogCount:pool.length,variants:results},null,2));
  }
  // Ensure report is parseable before declaring completion.
  JSON.parse(await readFile(path,'utf8'));
} catch(e) {console.error(JSON.stringify({failed:true,type:e instanceof Error?e.name:'unknown'}));process.exitCode=1;}
finally{client.close();}
