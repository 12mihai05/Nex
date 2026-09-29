import { describe, expect, it } from "vitest";
import { buildDiscoveryRows, discoverHome, discoveryShelves } from "../src/services/discovery.js";
import { fixtureCatalog } from "../src/fixtures/catalog.js";
import { FixtureTmdbRepository } from "../src/repositories/tmdb-repository.js";
import { onboardingBodySchema } from "../src/http/schemas.js";
import { readFileSync } from "node:fs";
import { scoreCandidate } from "../src/services/recommendation.js";
import { filterQuerySchema } from "../src/domain/types.js";

const state = () => ({country:"RO",timezone:"Europe/Bucharest",ownedProviderIds:[8],taste:[],watchedIds:new Set<number>(),watchlistIds:new Set<number>(),watchedKeys:new Set<string>(),watchlistKeys:new Set<string>(),ratedKeys:new Set<string>(),rejectedKeys:new Set<string>(),recentlyShown:new Map<string,number>(),wantHints:[],seenHints:[],behaviorPersonalization:true,favorites:[],saved:[]});
const items = Array.from({length:180},(_,id)=>({...fixtureCatalog[0]!,id:id+1,title:`Title ${id}`,mediaType:id%5===0?"series" as const:"movie" as const,genres:[["Drama"],["Comedy"],["Thriller"],["Animation"]][id%4]!,keywords:id%3===0?["underdog"]:[],moods:[],rating:8,voteCount:500,runtimeMinutes:id%2===0?85:125,year:id%3===0?1990:2026,availability:[{providerId:8,providerName:"Netflix",logoUrl:null,access:"included" as const,owned:true}]}));
describe("personalized discovery shelves",()=>{
  it("prioritizes mixed story preferences and suppresses strongly disliked category rows",()=>{
    const s={...state(),taste:[
      {dimension:"keyword",key:"underdog",score:.9,confidence:.9,evidenceCount:3,source:"explicit_edit"},
      {dimension:"genre",key:"Documentary",score:-.9,confidence:.9,evidenceCount:3,source:"explicit_edit"},
      {dimension:"genre",key:"Romance",score:.8,confidence:.9,evidenceCount:3,source:"explicit_edit"},
    ]};
    const rows=discoveryShelves(s).map(r=>r.id);
    expect(rows[0]).toBe("for-you");
    expect(rows.slice(1,6)).toContain("concept:underdog");
    expect(rows.slice(1,6)).toContain("genre:Romance");
    expect(rows).not.toContain("genre:Documentary");
    expect(discoveryShelves({...s,taste:[]}).some(r=>r.id==="genre:Documentary")).toBe(true);
    expect(discoveryShelves(s).map(r=>r.id)).toEqual(rows);
  });
  it("shows a small available watchlist near the top without inferring a strong like",()=>{
    const s=state();s.watchlistKeys.add("movie:2");
    const rows=buildDiscoveryRows(items,s,"u");
    expect(rows[1]?.id).toBe("watchlist");
    expect(rows[1]?.items.map(r=>r.item.id)).toEqual([2]);
  });
  it("a carried page plan prevents changed tastes from shifting batch boundaries",()=>{
    const initial=state();const plan=discoveryShelves(initial).map(r=>r.id);
    const changed={...initial,taste:[{dimension:"genre",key:"Comedy",score:.9,confidence:.9,evidenceCount:1,source:"explicit_edit"}]};
    for(let batch=0;batch<6;batch++){
      const rows=buildDiscoveryRows(items,changed,"u",{},batch,plan);
      expect(rows.every(r=>plan.slice(batch*6,batch*6+6).includes(r.id))).toBe(true);
    }
  });
  it("offers broad, distinct category definitions and retrieves bounded batches",async()=>{
    const definitions=discoveryShelves(state());
    expect(definitions.length).toBeGreaterThanOrEqual(30);
    expect(definitions.length).toBeLessThanOrEqual(36);
    expect(new Set(definitions.map(s=>s.id)).size).toBe(definitions.length);
    const catalog=new FixtureTmdbRepository();
    let calls=0;
    catalog.discover=async()=>{calls++;return items;};
    const ids=new Set<string>();
    for(let batch=0;batch<6;batch++) {
      calls=0;
      const rows=await discoverHome(catalog,state(),"u",{mediaType:"movie",minRuntimeMinutes:80,maxRuntimeMinutes:90},batch);
      expect(calls).toBeLessThanOrEqual(6);
      expect(rows.length).toBeLessThanOrEqual(6);
      for(const row of rows) {
        expect(ids.has(row.id)).toBe(false);ids.add(row.id);
        expect(row.items.every(r=>r.item.mediaType==="movie"&&r.item.runtimeMinutes!>=80&&r.item.runtimeMinutes!<=90)).toBe(true);
      }
    }
    // Row-level deduplication may omit overlapping shelves in any given batch.
    expect(ids.size).toBeGreaterThanOrEqual(6);
  });
  it("applies global type, genre and inclusive duration bounds to every shelf",()=>{
    for(const filter of [{mediaType:"movie" as const,minRuntimeMinutes:80,maxRuntimeMinutes:90},{mediaType:"series" as const},{mediaType:"movie" as const,genres:["Drama"],minRuntimeMinutes:80,maxRuntimeMinutes:90}]) {
      const rows=buildDiscoveryRows(items,state(),"u",filter);
      expect(rows.length).toBeGreaterThan(0);
      for(const row of rows) for(const {item} of row.items) {
        expect(item.mediaType).toBe(filter.mediaType);
        if(filter.genres) expect(item.genres).toContain("Drama");
        if(filter.minRuntimeMinutes) expect(item.runtimeMinutes).toBeGreaterThanOrEqual(80);
        if(filter.maxRuntimeMinutes) expect(item.runtimeMinutes).toBeLessThanOrEqual(90);
      }
    }
  });
  it("retrieves series-specific shelves and never widens a selected movie range",async()=>{
    const catalog=new FixtureTmdbRepository();
    const calls:Array<Parameters<typeof catalog.discover>[0]>=[];
    catalog.discover=async q=>{calls.push(q);return items;};
    await discoverHome(catalog,state(),"u",{mediaType:"movie",genres:["Drama"],minRuntimeMinutes:110,maxRuntimeMinutes:140});
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.every(q=>q.mediaType==="movie"&&q.minRuntimeMinutes===110&&q.maxRuntimeMinutes===140&&q.genres?.[0]==="Drama")).toBe(true);
    calls.length=0;
    const rows=await discoverHome(catalog,state(),"u",{mediaType:"series"});
    expect(calls.every(q=>q.mediaType==="series")).toBe(true);
    expect(calls.some(q=>q.genres?.includes("Drama"))).toBe(true);
    expect(rows.length).toBeGreaterThan(1);
  });
  it("every mobile genre, mood and concept becomes a grounded ranking signal",()=>{
    const source=readFileSync(new URL("../../mobile/lib/src/data/taste_options.dart",import.meta.url),"utf8");
    for(const [section,dimension,field] of [["Genres","genre","genres"],["Moods","mood","moods"],["Concepts","keyword","keywords"]] as const) {
      const block=source.split(`const onboarding${section} = [`)[1]!.split("];",1)[0]!;
      const choices=[...block.matchAll(/'([^']+)'/g)].map(m=>m[1]!);
      expect(choices.length).toBeGreaterThan(10);
      for(const key of choices) {
        const candidate={...items[0]!,genres:[],moods:[],keywords:[],[field]:[key]};
        const ranked=scoreCandidate(candidate,filterQuerySchema.parse({intent:"DISCOVERY"}),{...state(),viewerIds:["u"],temporaryMoods:[],taste:[{dimension,key,score:.85,confidence:.8,evidenceCount:1,source:"onboarding_explicit"}]});
        expect(ranked?.evidence.some(e=>e.code===`taste:${dimension}`),`${section}: ${key}`).toBe(true);
      }
    }
  });
  it("builds substantial, bounded, differentiated shelves",()=>{
    const rows=buildDiscoveryRows(items,state(),"u");
    expect(rows.length).toBeGreaterThanOrEqual(7);
    expect(rows.length).toBeLessThanOrEqual(36);
    expect(rows[0]!.items).toHaveLength(20);
    const counts=new Map<string,number>();
    for(const row of rows){expect(row.items.length).toBeLessThanOrEqual(20);expect(new Set(row.items.map(r=>r.item.id)).size).toBe(row.items.length);for(const r of row.items)counts.set(r.item.title,(counts.get(r.item.title)??0)+1);}
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(3);
    expect(rows.find(r=>r.id==="short")!.items.every(r=>r.item.runtimeMinutes!<=100&&r.item.mediaType==="movie")).toBe(true);
    expect(rows.find(r=>r.id==="series")!.items.every(r=>r.item.mediaType==="series")).toBe(true);
  });
  it("excludes seen, rated, rejected and unavailable titles from every shelf",()=>{
    const s=state();s.watchedKeys.add("movie:2");s.ratedKeys.add("movie:3");s.rejectedKeys.add("movie:4");
    const pool=items.map(i=>i.id===5?{...i,availability:[]}:i);
    const flat=buildDiscoveryRows(pool,s,"u").flatMap(r=>r.items);
    expect(flat.some(r=>[2,3,4,5].includes(r.item.id))).toBe(false);
  });
  it("does not fabricate shelves in a sparse market",()=>expect(buildDiscoveryRows(items.slice(0,2),state(),"u")).toEqual([]));
  it("accepts explicit concepts independently of genre and mood",()=>{
    const body=onboardingBodySchema.parse({description:"",favorites:[],genres:["Documentary","Romance"],moods:["Bittersweet"],concepts:["underdog","found family"]});
    expect(body.concepts).toEqual(["underdog","found family"]);
  });
  it("uses a bounded catalog-only query set and recovers from a partial source failure",async()=>{
    const catalog=new FixtureTmdbRepository();let calls=0,active=0,max=0;
    catalog.discover=async()=>{calls++;active++;max=Math.max(max,active);await Promise.resolve();active--;if(calls===1)throw Error("Unavailable");return items;};
    expect((await discoverHome(catalog,state(),"u")).length).toBeGreaterThan(2);
    expect(calls).toBeLessThanOrEqual(11);expect(max).toBeLessThanOrEqual(3);
  });
});
