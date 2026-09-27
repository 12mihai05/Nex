import "../src/env.js";
import {createTmdbRepository} from "../src/repositories/tmdb-repository.js";
import {conceptEvidence} from "../src/services/concepts.js";
import {closeDatabase} from "../src/db/client.js";

// Read-only public catalog diagnostic. Never output credentials or raw errors.
try {
  const catalog=createTmdbRepository();
  for(const keyword of ["problem solving","teamwork"]){
    const items=await catalog.discover({region:"RO",providerIds:[8,1899],mediaType:"movie",maxRuntimeMinutes:129,keywords:[keyword],limit:12});
    console.log(JSON.stringify({keyword,items:items.map(i=>({title:i.title,overview:i.overview,keywords:i.keywords,problem:conceptEvidence(i,"problem solving"),team:conceptEvidence(i,"teamwork")}))}));
  }
} catch { console.error("CATALOG_DIAGNOSTIC_FAILED: details suppressed");process.exitCode=1; }
finally {await closeDatabase();}
