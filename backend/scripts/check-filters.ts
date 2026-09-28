import "../src/env.js";
import assert from "node:assert/strict";
import { createTmdbRepository } from "../src/repositories/tmdb-repository.js";
import { catalogFilterSchema, filteredCatalog } from "../src/services/filtered-catalog.js";
import { closeDatabase } from "../src/db/client.js";
import { discoverHome } from "../src/services/discovery.js";

const catalog=createTmdbRepository();
const state={country:"RO",timezone:"Europe/Bucharest",ownedProviderIds:[8,119,1899],taste:[],watchedIds:new Set<number>(),watchlistIds:new Set<number>(),watchedKeys:new Set<string>(),watchlistKeys:new Set<string>(),ratedKeys:new Set<string>(),rejectedKeys:new Set<string>(),recentlyShown:new Map<string,number>(),wantHints:[],seenHints:[],behaviorPersonalization:true,favorites:[],saved:[]};
try {
  assert.equal(catalog.mode,"live");
  let totalRows=0;const uniqueTitles=new Set<string>();
  for(let batch=0;batch<6;batch++) {
    const start=Date.now();const rows=await discoverHome(catalog,state,"synthetic-batch-check",{},batch);
    totalRows+=rows.length;
    for(const row of rows)for(const {item} of row.items)uniqueTitles.add(`${item.mediaType}:${item.id}`);
    assert.ok(rows.every(r=>r.items.every(({item:i})=>i.availability.some(a=>a.owned&&a.access==="included"))));
    console.log(JSON.stringify({batch,rows:rows.length,titles:rows.map(r=>r.title),milliseconds:Date.now()-start}));
  }
  assert.ok(totalRows>10);console.log(JSON.stringify({totalRows,uniqueTitles:uniqueTitles.size}));
  for(const filter of [{mediaType:"movie" as const,minRuntimeMinutes:60,maxRuntimeMinutes:90},{mediaType:"series" as const}]) {
    const start=Date.now();
    const rows=await discoverHome(catalog,state,"synthetic-shelves-check",filter);
    assert.ok(rows.length>1);
    assert.ok(rows.every(r=>r.items.every(({item:i})=>i.mediaType===filter.mediaType&&(!filter.minRuntimeMinutes||(i.runtimeMinutes??0)>=filter.minRuntimeMinutes)&&(!filter.maxRuntimeMinutes||(i.runtimeMinutes??Infinity)<=filter.maxRuntimeMinutes))));
    console.log(JSON.stringify({homeFilter:filter,rows:rows.length,counts:rows.map(r=>r.items.length),milliseconds:Date.now()-start,valid:true}));
  }
  for(const input of [{mediaType:"movie",minMinutes:60,maxMinutes:90},{mediaType:"movie",genre:"Drama",minMinutes:90,maxMinutes:150},{mediaType:"series",genre:"Comedy"}]) {
    const start=Date.now();
    const result=await filteredCatalog(catalog,state,"synthetic-filter-check",catalogFilterSchema.parse(input));
    assert.ok(result.data.length>0);
    assert.ok(result.data.every(i=>i.mediaType===input.mediaType && (!input.genre||i.genres.includes(input.genre)) && (!input.minMinutes||(i.runtimeMinutes??0)>=input.minMinutes) && (!input.maxMinutes||(i.runtimeMinutes??Infinity)<=input.maxMinutes) && i.availability.some(a=>a.owned&&a.access==="included")));
    console.log(JSON.stringify({filters:input,results:result.data.length,milliseconds:Date.now()-start,valid:true}));
  }
  const start=Date.now();
  const titles=await catalog.search({query:"The Truman Show",region:"RO",summaryOnly:true});
  assert.ok(titles.some(i=>i.title==="The Truman Show"));
  console.log(JSON.stringify({onboardingSearch:true,results:titles.length,milliseconds:Date.now()-start}));
} catch { console.log("Live filter verification failed; sensitive details suppressed.");process.exitCode=1; }
finally { await closeDatabase(); }
