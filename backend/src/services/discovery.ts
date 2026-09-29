import { filterQuerySchema, type ContentItem, type FilterQuery, type RankedContent } from "../domain/types.js";
import type { DiscoverOptions, TmdbRepository } from "../repositories/tmdb-repository.js";
import type { UserRepository } from "../repositories/user-repository.js";
import { rankCandidates, scoreCandidate, titleKey } from "./recommendation.js";
import { conceptEvidence } from "./concepts.js";
import { contentTraits } from "./content-traits.js";

type State = Awaited<ReturnType<UserRepository["getRecommendationState"]>>;
export type HomeFilters = Partial<FilterQuery> & {watchStatus?: "new" | "again" | "either"};
const watchedCache = new WeakMap<TmdbRepository,Map<string,{at:number;promise:Promise<ContentItem[]>}>>();

// Bounded, cached metadata hydration; history insertion dates are NOT watch dates.
export async function watchedCandidates(catalog: TmdbRepository, state: State, favoritesOnly = false) {
  const favorites = new Set(state.favorites.map(f => `${f.mediaType}:${f.tmdbId}`));
  const keys = [...state.watchedKeys].filter(k => !state.rejectedKeys.has(k) && (!favoritesOnly || favorites.has(k)));
  // Rotate the long tail daily, keeping explicitly liked titles ahead of weak seen hints.
  const day = Math.floor(Date.now() / 86_400_000);
  const rotated = keys.length ? [...keys.slice(day % keys.length), ...keys.slice(0, day % keys.length)] : keys;
  rotated.sort((a,b) => Number(favorites.has(b)) - Number(favorites.has(a)));
  const pool: ContentItem[] = [];
  const selected = rotated.slice(0, favoritesOnly ? 20 : 60);
  const cache = watchedCache.get(catalog) ?? new Map<string,{at:number;promise:Promise<ContentItem[]>}>();
  watchedCache.set(catalog,cache);
  const cacheKey=JSON.stringify([state.country,state.ownedProviderIds,selected]);
  const cached=cache.get(cacheKey);
  if(cached && Date.now()-cached.at<60_000) return cached.promise;
  const hydrate = async () => {
  let failed=0;
  for (let i=0;i<selected.length;i+=3) {
    const results = await Promise.allSettled(selected.slice(i,i+3).map(key => {
      const [type,id] = key.split(":");
      return type === "movie" || type === "series" ? catalog.getTitle(type,Number(id),state.country,state.ownedProviderIds) : Promise.resolve(null);
    }));
    pool.push(...results.flatMap(r => r.status === "fulfilled" && r.value ? [r.value] : []));
    failed+=results.filter(r=>r.status==="rejected").length;
  }
  if(failed) cache.delete(cacheKey);
  if(selected.length && failed===selected.length) throw new Error("CATALOG_UNAVAILABLE");
  return pool;
  };
  if(cache.size>=32) cache.delete(cache.keys().next().value!);
  const promise=hydrate();
  cache.set(cacheKey,{at:Date.now(),promise});
  return promise;
}
type Shelf = { id: string; title: string; subtitle: string; filter?: Partial<FilterQuery>; accepts?: (item: ContentItem) => boolean };
export function discoveryShelves(state: State): Shelf[] {
  const liked = (dimension: string) => state.taste.filter(s => s.dimension === dimension && s.score > .3 && s.confidence >= .35)
    .sort((a,b) => b.score*b.confidence-a.score*a.confidence).map(s=>s.key);
  const genres = [...new Set([...liked("genre"), "Drama", "Comedy", "Thriller", "Animation"])].slice(0,4);
  const concepts = [...new Set([...liked("keyword"), ...liked("theme")])].slice(0,4);
  const shelves: Shelf[] = [
    { id:"for-you",title:"Your opening credits",subtitle:"Personal picks, ranked around your taste" },
    ...(state.watchlistKeys.size?[{id:"watchlist",title:"From your watchlist",subtitle:"Unseen picks available on your services",accepts:(i:ContentItem)=>state.watchlistKeys.has(titleKey(i))}]:[]),
    ...concepts.map(key=>({id:`concept:${key}`,title:`Stories of ${key}`,subtitle:"A theme you enjoy, across genres",filter:{keywords:[key]},accepts:(i:ContentItem)=>Boolean(conceptEvidence(i,key))})),
    ...genres.map(key=>({id:`genre:${key}`,title:`Your take on ${key.toLowerCase()}`,subtitle:"Familiar territory, fresh possibilities",filter:{genres:[key]}})),
    { id:"short",title:"A little less time",subtitle:"Movies under 100 minutes",filter:{mediaType:"movie" as const,maxRuntimeMinutes:100} },
    { id:"series",title:"Find your next series",subtitle:"A longer story to settle into",filter:{mediaType:"series" as const} },
    { id:"acclaimed",title:"Highly rated, personally picked",subtitle:"Strong audience ratings",accepts:(i:ContentItem)=>(i.rating??0)>=7.5&&(i.voteCount??0)>=250 },
    { id:"feel-good",title:"A lighter evening",subtitle:"A change of pace, still ranked for you",accepts:(i:ContentItem)=>[...contentTraits(i)].some(t=>["feel-good","cozy","funny"].includes(t)) },
    { id:"recent",title:"Recent stories",subtitle:"Released in the last three years",accepts:(i:ContentItem)=>(i.year??0)>=new Date().getUTCFullYear()-2 },
    { id:"classics",title:"Worth going back for",subtitle:"Pre-2000 films you haven’t marked seen",filter:{mediaType:"movie" as const},accepts:(i:ContentItem)=>(i.year??9999)<2000 },
    ...["Science Fiction","Mystery","Adventure","Crime","Romance","Documentary","Fantasy","Action","History","Horror"].filter(key=>!genres.includes(key)).map(key=>({id:`genre:${key}`,title:key,subtitle:"Ranked for your taste and services",filter:{genres:[key]}})),
    ...["underdog","found family","revenge","survival"].filter(key=>!concepts.includes(key)).map(key=>({id:`concept:${key}`,title:({underdog:"Against the odds","found family":"Finding your people",revenge:"Settling the score",survival:"Survival stories"} as Record<string,string>)[key]!,subtitle:"Stories connected by more than genre",filter:{keywords:[key]},accepts:(i:ContentItem)=>Boolean(conceptEvidence(i,key))})),
    ...[...new Set([...liked("mood").slice(0,2).map(k=>k.toLowerCase()),"cerebral","tense","bittersweet","weird"])].map(key=>({id:`mood:${key}`,title:({cerebral:"Something to think about",tense:"Keep you guessing",bittersweet:"Bittersweet stories",weird:"A little out of the ordinary"} as Record<string,string>)[key]??`${key[0]!.toUpperCase()}${key.slice(1)} stories`,subtitle:"A different mood, personalized for you",accepts:(i:ContentItem)=>contentTraits(i).has(key)})),
    {id:"2000s",title:"From the 2000s",subtitle:"Stories worth catching up on",accepts:(i:ContentItem)=>(i.year??0)>=2000&&(i.year??0)<2010},
    {id:"2010s",title:"From the 2010s",subtitle:"Recent favourites you may have missed",accepts:(i:ContentItem)=>(i.year??0)>=2010&&(i.year??0)<2020},
  ];
  const affinity=(s:Shelf)=>{
    const [dimension,key]=s.id.split(":");
    const dimensions=dimension==="concept"?["keyword","theme"]:[dimension];
    return state.taste.filter(t=>dimensions.includes(t.dimension)&&t.key.toLowerCase()===key?.toLowerCase())
      .reduce((sum,t)=>sum+t.score*t.confidence,0);
  };
  // A small deterministic rotation, not a popularity shuffle; taste dominates it.
  const rotation=(s:Shelf)=>[...`${new Date().toISOString().slice(0,10)}:${s.id}`].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0)%100/100;
  const remaining=shelves.slice(1).filter(s=>affinity(s)>-.45);
  const ordered=[shelves[0]!];
  while(remaining.length){
    const score=(s:Shelf)=>s.id==="watchlist"?100:affinity(s)*8+rotation(s)*.6+
      (["acclaimed","recent","short","series"].includes(s.id)?1:0)-
      (ordered.slice(-2).filter(p=>p.id.split(":")[0]===s.id.split(":")[0]).length*2);
    remaining.sort((a,b)=>score(b)-score(a)||a.id.localeCompare(b.id));
    ordered.push(remaining.shift()!);
  }
  if (state.favorites.filter(f=>state.watchedKeys.has(`${f.mediaType}:${f.tmdbId}`)).length >= 3)
    ordered.splice(6,0,{id:"rewatch",title:"Watch again",subtitle:"Seen and liked, available on your services",accepts:i=>state.watchedKeys.has(titleKey(i))&&state.favorites.some(f=>`${f.mediaType}:${f.tmdbId}`===titleKey(i))});
  return ordered.slice(0,36);
}
export function buildDiscoveryRows(items: ContentItem[], state: State, userId: string, filters: HomeFilters = {}, batch?: number, plan?: string[]) {
  if (filters.providerIds?.some(id=>!state.ownedProviderIds.includes(id))) return [];
  if (filters.watchStatus === "again") items=items.filter(i=>state.watchedKeys.has(titleKey(i)));
  const global = filterQuerySchema.parse({intent:"DISCOVERY",...filters,excludeWatched:false});
  // Apply global hard constraints before individual shelves; a shelf must never widen them.
  if(Object.keys(filters).length) items = items.filter(item=>scoreCandidate(item,global,{...state,viewerIds:[userId],temporaryMoods:[]})!==null);
  const occurrences = new Map<string,number>();
  const rows: Array<{id:string;title:string;subtitle:string;items:RankedContent[]}> = [];
  const definitions=plannedShelves(state,plan);
  for (const shelf of batch===undefined?definitions:definitions.slice(batch*6,batch*6+6)) {
    if (shelf.id === "rewatch" && filters.watchStatus !== undefined) continue;
    const query = filterQuerySchema.parse({intent:"DISCOVERY",...shelf.filter,excludeWatched:shelf.id!=="rewatch" && filters.watchStatus!=="again" && filters.watchStatus!=="either"});
    const eligible = items.filter(i=>(!shelf.accepts||shelf.accepts(i))&&(occurrences.get(titleKey(i))??0)<3 &&
      (shelf.id!=="rewatch" || i.availability.some(a=>a.access==="included"&&state.ownedProviderIds.includes(a.providerId))));
    const ranked = rankCandidates(eligible,query,{...state,viewerIds:[userId],temporaryMoods:[]},20);
    if (ranked.length < (shelf.id==="rewatch" ? 3 : Object.keys(filters).length || shelf.id==="watchlist" ? 1 : 3)) continue;
    if (rows.some(r=>ranked.filter(i=>r.items.some(j=>titleKey(j.item)===titleKey(i.item))).length/Math.max(r.items.length,ranked.length)>.85)) continue;
    rows.push({id:shelf.id,title:shelf.title,subtitle:filters.watchStatus && filters.watchStatus!=="new" ? "Ranked for your taste and selected services" : shelf.subtitle,items:ranked});
    for (const r of ranked) occurrences.set(titleKey(r.item),(occurrences.get(titleKey(r.item))??0)+1);
    if (rows.length===36) break;
  }
  // Rank within a bounded batch using actual match strength and avoid adjacent
  // variants of the same category. The first shelf remains a familiar anchor.
  const arranged:typeof rows=[];
  const pending=[...rows];
  while(pending.length){
    const value=(r:typeof rows[number])=>r.id==="rewatch" && batch===undefined && arranged.length<3 ? -10000 : r.id==="for-you"?10000:r.id==="watchlist"?9999:
      r.items.slice(0,8).reduce((n,i)=>n+i.score,0)/Math.min(8,r.items.length)+
      Math.min(r.items.length,20)*.03-
      (arranged.at(-1)?.id.split(":")[0]===r.id.split(":")[0]?1.5:0);
    pending.sort((a,b)=>value(b)-value(a));arranged.push(pending.shift()!);
  }
  return arranged;
}
function plannedShelves(state:State,plan?:string[]) {
  const shelves=discoveryShelves(state);
  if(!plan)return shelves;
  // Only known definitions may be requested. Current hard exclusions still apply.
  const byId=new Map(shelves.map(s=>[s.id,s]));
  return plan.map(id=>byId.get(id)??{id,title:"",subtitle:"",accepts:()=>false});
}
export async function discoverHome(catalog: TmdbRepository, state: State, userId: string, filters: HomeFilters = {}, batch?: number, plan?:string[]) {
  if (filters.providerIds?.some(id=>!state.ownedProviderIds.includes(id))) return [];
  const hardFilters = {...filters};
  if(hardFilters.providerIds === undefined) delete hardFilters.providerIds;
  if(!hardFilters.genres?.length) delete hardFilters.genres;
  const common: DiscoverOptions = {region:state.country,providerIds:state.ownedProviderIds,limit:20};
  const definitions=plannedShelves(state,plan);
  if(batch!==undefined&&batch*6>=definitions.length) return [];
  const currentDefinitions=batch===undefined?definitions:definitions.slice(batch*6,batch*6+6);
  if(filters.watchStatus==="again") return buildDiscoveryRows(await watchedCandidates(catalog,state),state,userId,filters,batch,plan);
  const queries: DiscoverOptions[] = batch===undefined?[
    {...common,mediaType:"movie"}, {...common,mediaType:"series"},
    {...common,mediaType:"movie",sortBy:"popularity.desc"}, {...common,mediaType:"movie",page:2},
    ...definitions.filter(s=>s.filter&&(s.filter.genres||s.filter.keywords||s.id==="short")).slice(0,7).map(s=>({...common,mediaType:"movie" as const,...s.filter})),
  ]:definitions.slice(batch*6,batch*6+6).map((s,index)=>({...common,mediaType:filters.mediaType==="series"?"series" as const: s.filter?.mediaType==="series"?"series" as const:"movie" as const,page:s.filter?1:batch+1,...s.filter,...(!s.filter&&index%2?{sortBy:"popularity.desc" as const}:{})}));
  const constrained: DiscoverOptions[] = [...new Map(queries.filter(q=>!filters.mediaType||filters.mediaType==="any"||!q.mediaType||q.mediaType===filters.mediaType)
    .map(q=>({...q,...hardFilters, ...(filters.mediaType==="any"?{mediaType:q.mediaType}:{}),
      // Preserve short-shelf bounds when they are stricter than the global maximum.
      maxRuntimeMinutes: q.maxRuntimeMinutes && filters.maxRuntimeMinutes ? Math.min(q.maxRuntimeMinutes,filters.maxRuntimeMinutes) : filters.maxRuntimeMinutes??q.maxRuntimeMinutes??null}))
    .filter(q=>!q.minRuntimeMinutes||!q.maxRuntimeMinutes||q.minRuntimeMinutes<=q.maxRuntimeMinutes)
    .map(q=>[JSON.stringify(q),q])).values()];
  // Series need their own genre sources, not just the default mixed home query.
  if(batch===undefined && filters.mediaType==="series" && !filters.genres?.length) for(const genre of ["Drama","Comedy","Mystery","Documentary"])
    constrained.push({...common,...filters,mediaType:"series",genres:filters.genres?.length?filters.genres:[genre]});
  const pool: ContentItem[] = [];
  const savedPool=(async()=>{const found:ContentItem[]=[];
  if(filters.watchStatus==="either" || (filters.watchStatus===undefined && currentDefinitions.some(s=>s.id==="rewatch")))
    found.push(...await watchedCandidates(catalog,state,filters.watchStatus!=="either").catch(()=>[]));
  if((batch===undefined?definitions:definitions.slice(batch*6,batch*6+6)).some(s=>s.id==="watchlist")){
    const saved=state.saved.filter(s=>s.mediaType==="movie"||s.mediaType==="series").slice(0,20);
    for(let i=0;i<saved.length;i+=3){
      const result=await Promise.allSettled(saved.slice(i,i+3).map(s=>catalog.getTitle(s.mediaType as "movie"|"series",s.tmdbId,state.country,state.ownedProviderIds)));
      found.push(...result.flatMap(r=>r.status==="fulfilled"&&r.value?[r.value]:[]));
    }
  }
  return found;})();
  let succeeded = 0;
  for(let start=0;start<constrained.length;start+=3) {
    const results = await Promise.allSettled(constrained.slice(start,start+3).map(q=>catalog.discover(q)));
    for(const result of results) if(result.status==="fulfilled") { succeeded++;pool.push(...result.value); }
  }
  pool.push(...await savedPool);
  if(!succeeded&&constrained.length&&!pool.length) throw new Error("CATALOG_UNAVAILABLE");
  return buildDiscoveryRows([...new Map(pool.map(i=>[titleKey(i),i])).values()],state,userId,filters,batch,plan);
}
