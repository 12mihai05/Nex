import '../src/env.js';
import {writeFile} from 'node:fs/promises';
import {getConfig} from '../src/config.js';
import {closeDatabase} from '../src/db/client.js';
import {LiveTmdbRepository} from '../src/repositories/tmdb-repository.js';
import {discoverHome,discoveryShelves} from '../src/services/discovery.js';

// Synthetic profile; only public TMDB metadata caches are touched. No real
// person's profile, recommendation impressions or library are modified.
const state={country:'RO',timezone:'Europe/Bucharest',ownedProviderIds:[8],taste:[],watchedIds:new Set<number>(),watchlistIds:new Set<number>(),watchedKeys:new Set<string>(),watchlistKeys:new Set<string>(),ratedKeys:new Set<string>(),rejectedKeys:new Set<string>(),recentlyShown:new Map<string,number>(),wantHints:[],seenHints:[],behaviorPersonalization:true,favorites:[],saved:[]};
const report:{batches:unknown[];complete:boolean}={batches:[],complete:false};
try{
 const catalog=new LiveTmdbRepository(getConfig().TMDB_READ_ACCESS_TOKEN!),seen:string[]=[],plan=discoveryShelves(state).map(s=>s.id);
 for(let batch=0;batch<6;batch++){
  const start=Date.now(),rows=await discoverHome(catalog,state,'synthetic-fill-check',{},batch,plan,seen);
  for(const row of rows)for(const r of row.items){const key=`${r.item.mediaType}:${r.item.id}`;if(seen.includes(key))throw new Error('DUPLICATE');seen.push(key);}
  const result={batch,ms:Date.now()-start,rows:rows.map(r=>({id:r.id,count:r.items.length})),uniqueDelivered:seen.length};
  report.batches.push(result);console.log(JSON.stringify(result));
 }
 report.complete=true;
}catch{console.log(JSON.stringify({verificationFailed:true,detailsWithheld:true}));process.exitCode=1;}
finally{await writeFile(new URL('../../docs/evaluations/home-fill.json',import.meta.url),JSON.stringify(report,null,2));await closeDatabase();}
