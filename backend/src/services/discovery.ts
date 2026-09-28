import { filterQuerySchema, type ContentItem, type FilterQuery, type RankedContent } from "../domain/types.js";
import type { DiscoverOptions, TmdbRepository } from "../repositories/tmdb-repository.js";
import type { UserRepository } from "../repositories/user-repository.js";
import { rankCandidates, scoreCandidate, titleKey } from "./recommendation.js";
import { conceptEvidence } from "./concepts.js";
import { contentTraits } from "./content-traits.js";

type State = Awaited<ReturnType<UserRepository["getRecommendationState"]>>;
type Shelf = { id: string; title: string; subtitle: string; filter?: Partial<FilterQuery>; accepts?: (item: ContentItem) => boolean };
export function discoveryShelves(state: State): Shelf[] {
  const liked = (dimension: string) => state.taste.filter(s => s.dimension === dimension && s.score > .3 && s.confidence >= .35)
    .sort((a,b) => b.score*b.confidence-a.score*a.confidence).map(s=>s.key);
  const genres = [...new Set([...liked("genre"), "Drama", "Comedy", "Thriller", "Animation"])].slice(0,4);
  const concepts = [...new Set([...liked("keyword"), ...liked("theme")])].slice(0,2);
  return [
    { id:"for-you",title:"Your opening credits",subtitle:"Personal picks, ranked around your taste" },
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
    ...["cerebral","tense","bittersweet","weird"].map(key=>({id:`mood:${key}`,title:({cerebral:"Something to think about",tense:"Keep you guessing",bittersweet:"Bittersweet stories",weird:"A little out of the ordinary"} as Record<string,string>)[key]!,subtitle:"A different mood, personalized for you",accepts:(i:ContentItem)=>contentTraits(i).has(key)})),
    {id:"2000s",title:"From the 2000s",subtitle:"Stories worth catching up on",accepts:(i:ContentItem)=>(i.year??0)>=2000&&(i.year??0)<2010},
    {id:"2010s",title:"From the 2010s",subtitle:"Recent favourites you may have missed",accepts:(i:ContentItem)=>(i.year??0)>=2010&&(i.year??0)<2020},
  ];
}
export function buildDiscoveryRows(items: ContentItem[], state: State, userId: string, filters: Partial<FilterQuery> = {}, batch?: number) {
  const global = filterQuerySchema.parse({intent:"DISCOVERY",...filters});
  // Apply global hard constraints before individual shelves; a shelf must never widen them.
  if(Object.keys(filters).length) items = items.filter(item=>scoreCandidate(item,global,{...state,viewerIds:[userId],temporaryMoods:[]})!==null);
  const occurrences = new Map<string,number>();
  const rows: Array<{id:string;title:string;subtitle:string;items:RankedContent[]}> = [];
  const definitions=discoveryShelves(state);
  for (const shelf of batch===undefined?definitions:definitions.slice(batch*6,batch*6+6)) {
    const query = filterQuerySchema.parse({intent:"DISCOVERY",...shelf.filter});
    const eligible = items.filter(i=>(!shelf.accepts||shelf.accepts(i))&&(occurrences.get(titleKey(i))??0)<3);
    const ranked = rankCandidates(eligible,query,{...state,viewerIds:[userId],temporaryMoods:[]},20);
    if (ranked.length < (Object.keys(filters).length ? 1 : 3)) continue;
    if (rows.some(r=>ranked.filter(i=>r.items.some(j=>titleKey(j.item)===titleKey(i.item))).length/Math.max(r.items.length,ranked.length)>.85)) continue;
    rows.push({id:shelf.id,title:shelf.title,subtitle:shelf.subtitle,items:ranked});
    for (const r of ranked) occurrences.set(titleKey(r.item),(occurrences.get(titleKey(r.item))??0)+1);
    if (rows.length===36) break;
  }
  return rows;
}
export async function discoverHome(catalog: TmdbRepository, state: State, userId: string, filters: Partial<FilterQuery> = {}, batch?: number) {
  const hardFilters = {...filters};
  if(!hardFilters.genres?.length) delete hardFilters.genres;
  const common: DiscoverOptions = {region:state.country,providerIds:state.ownedProviderIds,limit:20};
  const definitions=discoveryShelves(state);
  if(batch!==undefined&&batch*6>=definitions.length) return [];
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
  let succeeded = 0;
  for(let start=0;start<constrained.length;start+=3) {
    const results = await Promise.allSettled(constrained.slice(start,start+3).map(q=>catalog.discover(q)));
    for(const result of results) if(result.status==="fulfilled") { succeeded++;pool.push(...result.value); }
  }
  if(!succeeded&&constrained.length) throw new Error("CATALOG_UNAVAILABLE");
  return buildDiscoveryRows([...new Map(pool.map(i=>[titleKey(i),i])).values()],state,userId,filters,batch);
}
