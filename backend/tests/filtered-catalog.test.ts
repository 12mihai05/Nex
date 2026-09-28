import { expect, it } from "vitest";
import { catalogFilterSchema, filteredCatalog } from "../src/services/filtered-catalog.js";
import { FixtureTmdbRepository } from "../src/repositories/tmdb-repository.js";
import { fixtureCatalog } from "../src/fixtures/catalog.js";

const state = {country:"RO",timezone:"Europe/Bucharest",ownedProviderIds:[8],taste:[],watchedIds:new Set<number>(),watchlistIds:new Set<number>(),watchedKeys:new Set<string>(),watchlistKeys:new Set<string>(),ratedKeys:new Set<string>(),rejectedKeys:new Set<string>(),recentlyShown:new Map<string,number>(),wantHints:[],seenHints:[],behaviorPersonalization:true,favorites:[],saved:[]};
it("validates exact inclusive movie bounds and refuses series duration or reversed ranges", () => {
  expect(catalogFilterSchema.parse({mediaType:"movie",minMinutes:"70",maxMinutes:"70"}).minMinutes).toBe(70);
  for(const q of [{mediaType:"series",maxMinutes:80},{minMinutes:30},{mediaType:"movie",minMinutes:90,maxMinutes:60},{mediaType:"movie",maxMinutes:0},{mediaType:"movie",maxMinutes:70.5},{genre:"made up"},{page:501}]) expect(catalogFilterSchema.safeParse(q).success).toBe(false);
});
it("passes the lower bound into retrieval, ranks personally and never leaks out-of-range or unowned results", async () => {
  const catalog=new FixtureTmdbRepository();
  catalog.discover=async options=>{
    expect(options.minRuntimeMinutes).toBe(70);expect(options.maxRuntimeMinutes).toBe(90);
    expect(options.providerIds).toEqual([8]);expect(options.page).toBe(2);
    return [69,70,80,90,91,null].map((runtimeMinutes,id)=>({...fixtureCatalog[0]!,id:id+1,mediaType:"movie",genres:["Drama"],runtimeMinutes,
      availability:[{providerId:8,providerName:"Netflix",logoUrl:null,access:"included",owned:false}]}));
  };
  const result=await filteredCatalog(catalog,state,"user-a",catalogFilterSchema.parse({mediaType:"movie",genre:"Drama",minMinutes:70,maxMinutes:90,page:2}));
  expect(result.data.map(i=>i.runtimeMinutes).sort()).toEqual([70,80,90]);
  expect(result.data.every(i=>i.availability[0]?.owned)).toBe(true);
  expect(result.meta.hasMore).toBe(false);
  expect(state.taste).toEqual([]);
});
