import "../src/env.js";
import { createTmdbRepository } from "../src/repositories/tmdb-repository.js";
import { discoverHome } from "../src/services/discovery.js";
import { closeDatabase } from "../src/db/client.js";

const catalog=createTmdbRepository();
if(catalog.mode!=="live")throw Error("LIVE_TMDB_REQUIRED");
const started=Date.now();
try {
  const rows=await discoverHome(catalog,{
    country:"RO",timezone:"Europe/Bucharest",ownedProviderIds:[8,119,1899],
    taste:[{dimension:"keyword",key:"underdog",score:.9,confidence:.9,evidenceCount:1,source:"explicit_edit"},{dimension:"genre",key:"Mystery",score:.7,confidence:.8,evidenceCount:1,source:"explicit_edit"}],
    watchedIds:new Set(),watchedKeys:new Set(),watchlistIds:new Set(),watchlistKeys:new Set(),ratedKeys:new Set(),rejectedKeys:new Set(),recentlyShown:new Map(),wantHints:[],seenHints:[],behaviorPersonalization:true,favorites:[],saved:[],
  },"synthetic-discovery-check");
  const included=rows.every(r=>r.items.every(i=>i.item.availability.some(a=>a.owned&&a.access==="included")));
  console.log(JSON.stringify({milliseconds:Date.now()-started,rows:rows.map(r=>({id:r.id,count:r.items.length})),uniqueTitles:new Set(rows.flatMap(r=>r.items.map(i=>`${i.item.mediaType}:${i.item.id}`))).size,allIncludedOnSelectedServices:included}));
  if(!included||rows.length<3)process.exitCode=1;
} catch {console.log("Live discovery verification failed; sensitive error details suppressed.");process.exitCode=1;}
finally {await closeDatabase();}
