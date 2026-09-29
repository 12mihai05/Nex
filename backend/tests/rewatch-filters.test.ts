import { expect, it } from "vitest";
import { buildDiscoveryRows, discoverHome, discoveryShelves, watchedCandidates } from "../src/services/discovery.js";
import { catalogFilterSchema, filteredCatalog } from "../src/services/filtered-catalog.js";
import { FixtureTmdbRepository } from "../src/repositories/tmdb-repository.js";
import type { UserRepository } from "../src/repositories/user-repository.js";
import { fixtureCatalog } from "../src/fixtures/catalog.js";
import { pickTitle } from "../src/services/pick.js";
import { filterQuerySchema } from "../src/domain/types.js";
import { surpriseBodySchema } from "../src/http/schemas.js";

type State = Awaited<ReturnType<UserRepository['getRecommendationState']>>;
const state = (): State => ({country:'RO',timezone:'Europe/Bucharest',ownedProviderIds:[8,119],taste:[],watchedIds:new Set([1,2,3,4,5,6]),watchlistIds:new Set(),watchedKeys:new Set([1,2,3,4,5,6].map(id=>`movie:${id}`)),watchlistKeys:new Set(),ratedKeys:new Set([1,2,3,5,6,7].map(id=>`movie:${id}`)),rejectedKeys:new Set(['movie:6']),recentlyShown:new Map(),wantHints:[],seenHints:[],behaviorPersonalization:true,favorites:[1,2,3,7].map(tmdbId=>({tmdbId,mediaType:'movie',reaction:'like',userId:'u',createdAt:new Date(),updatedAt:new Date()})),saved:[]});
const items = Array.from({length:40},(_,n)=>({...fixtureCatalog[0]!,id:n+1,mediaType:'movie' as const,genres:['Drama'],runtimeMinutes:90,availability:[{providerId:n%2?119:8,providerName:n%2?'Prime Video':'Netflix',access:'included' as const,owned:true,logoUrl:null}]}));

it('Pick respects temporary services and viewing mode through retrieval and ranking',async()=>{
  const catalog=new FixtureTmdbRepository(),s=state();
  catalog.discover=async options=>{expect(options.providerIds).toEqual([8]);return items;};
  catalog.getTitle=async(type,id)=>items.find(i=>i.mediaType===type&&i.id===id)??null;
  for(const mode of ['new','again','either'] as const){
    const result=await pickTitle(catalog,s,'u',filterQuerySchema.parse({intent:'DISCOVERY',providerIds:[8]}),mode,[]);
    expect(result).toBeDefined();expect(result!.item.id%2).toBe(1);
    if(mode==='again')expect(s.watchedKeys.has(`movie:${result!.item.id}`)).toBe(true);
    if(mode==='new')expect(result!.item.id).toBeGreaterThan(7);
  }
  expect(await pickTitle(catalog,s,'u',filterQuerySchema.parse({intent:'DISCOVERY',providerIds:[999]}),'either',[])).toBeUndefined();
  expect(s.ownedProviderIds).toEqual([8,119]);
  expect(surpriseBodySchema.safeParse({providerIds:[]}).success).toBe(false);
  expect(surpriseBodySchema.safeParse({watchStatus:'invalid'}).success).toBe(false);
});

it('keeps default discovery fresh and one modest liked-and-seen row below discovery',()=>{
  const s=state();
  expect(discoveryShelves(s).findIndex(r=>r.id==='rewatch')).toBe(6);
  const rows=buildDiscoveryRows(items,s,'u');
  expect(rows.find(r=>r.id==='rewatch')?.items.map(r=>r.item.id).sort()).toEqual([1,2,3]);
  expect(rows.filter(r=>r.id!=='rewatch').flatMap(r=>r.items).every(r=>r.item.id>7)).toBe(true);
  expect(buildDiscoveryRows(items,{...s,ownedProviderIds:[]},'u').some(r=>r.id==='rewatch')).toBe(false);
  expect(buildDiscoveryRows(items.filter(i=>i.id!==3),s,'u').some(r=>r.id==='rewatch')).toBe(false);
});

it('new, again and either remain distinct through every shelf and provider constraint',()=>{
  for(const watchStatus of ['new','again','either'] as const){
    const rows=buildDiscoveryRows(items,state(),'u',{watchStatus,providerIds:[8],minRuntimeMinutes:90,maxRuntimeMinutes:90});
    const ids=rows.flatMap(r=>r.items.map(i=>i.item.id));
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every(id=>id%2===1)).toBe(true);
    expect(ids).not.toContain(6);
    if(watchStatus==='new') expect(ids.every(id=>id>7)).toBe(true);
    if(watchStatus==='again') {expect(ids.every(id=>id<=5)).toBe(true);expect(ids).not.toContain(7);}
    if(watchStatus==='either'){expect(ids).toContain(1);expect(ids.some(id=>id>7)).toBe(true);}
  }
  expect(buildDiscoveryRows(items,state(),'u',{providerIds:[999]})).toEqual([]);
});

it('hydrates actual history absent from discover, caches batches and invalidates changed history',async()=>{
  const catalog=new FixtureTmdbRepository();let calls=0;
  catalog.getTitle=async(type,id)=>{calls++;return items.find(i=>i.id===id&&i.mediaType===type)??null;};
  catalog.discover=async()=>{throw new Error('Watch again must not query discovery');};
  const s=state();
  const rows=await discoverHome(catalog,s,'u',{watchStatus:'again',providerIds:[8]},0);
  expect(rows.flatMap(r=>r.items).every(r=>s.watchedKeys.has(`movie:${r.item.id}`))).toBe(true);
  expect(rows.length).toBeGreaterThan(0);
  const before=calls;await discoverHome(catalog,s,'u',{watchStatus:'again'},1);
  expect(calls).toBe(before);
  s.watchedKeys.delete('movie:1');
  expect((await watchedCandidates(catalog,s)).some(i=>i.id===1)).toBe(false);
  expect(calls).toBeGreaterThan(before);
});

it('validates service selections and does not mutate saved subscriptions',async()=>{
  for(const providerIds of ['',',','8,','-1','8,abc','0','9007199254740992']) expect(catalogFilterSchema.safeParse({providerIds}).success).toBe(false);
  expect(catalogFilterSchema.parse({providerIds:'8,8'}).providerIds).toEqual([8]);
  const catalog=new FixtureTmdbRepository(),s=state();
  catalog.discover=async options=>{expect(options.providerIds).toEqual([8]);return items;};
  const result=await filteredCatalog(catalog,s,'u',catalogFilterSchema.parse({providerIds:'8',watchStatus:'either'}));
  expect(result.data.every(i=>i.availability.some(a=>a.providerId===8))).toBe(true);
  expect(s.ownedProviderIds).toEqual([8,119]);
  expect((await filteredCatalog(catalog,s,'u',catalogFilterSchema.parse({providerIds:'999'}))).data).toEqual([]);
});
