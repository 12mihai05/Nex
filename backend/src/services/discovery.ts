import { filterQuerySchema, type ContentItem, type FilterQuery, type RankedContent } from "../domain/types.js";
import type { DiscoverOptions, TmdbRepository } from "../repositories/tmdb-repository.js";
import type { UserRepository } from "../repositories/user-repository.js";
import { rankCandidates, titleKey } from "./recommendation.js";
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
  ];
}
export function buildDiscoveryRows(items: ContentItem[], state: State, userId: string) {
  const occurrences = new Map<string,number>();
  const rows: Array<{id:string;title:string;subtitle:string;items:RankedContent[]}> = [];
  for (const shelf of discoveryShelves(state)) {
    const query = filterQuerySchema.parse({intent:"DISCOVERY",...shelf.filter});
    const eligible = items.filter(i=>(!shelf.accepts||shelf.accepts(i))&&(occurrences.get(titleKey(i))??0)<3);
    const ranked = rankCandidates(eligible,query,{...state,viewerIds:[userId],temporaryMoods:[]},20);
    if (ranked.length < 3) continue;
    if (rows.some(r=>ranked.filter(i=>r.items.some(j=>titleKey(j.item)===titleKey(i.item))).length/Math.max(r.items.length,ranked.length)>.85)) continue;
    rows.push({id:shelf.id,title:shelf.title,subtitle:shelf.subtitle,items:ranked});
    for (const r of ranked) occurrences.set(titleKey(r.item),(occurrences.get(titleKey(r.item))??0)+1);
    if (rows.length===10) break;
  }
  return rows;
}
export async function discoverHome(catalog: TmdbRepository, state: State, userId: string) {
  const common: DiscoverOptions = {region:state.country,providerIds:state.ownedProviderIds,limit:20};
  const queries: DiscoverOptions[] = [
    {...common,mediaType:"movie"}, {...common,mediaType:"series"},
    {...common,mediaType:"movie",sortBy:"popularity.desc"}, {...common,mediaType:"movie",page:2},
    ...discoveryShelves(state).filter(s=>s.filter&&(s.filter.genres||s.filter.keywords||s.id==="short")).map(s=>({...common,mediaType:"movie" as const,...s.filter})),
  ];
  const pool: ContentItem[] = [];
  let succeeded = 0;
  for(let start=0;start<queries.length;start+=3) {
    const results = await Promise.allSettled(queries.slice(start,start+3).map(q=>catalog.discover(q)));
    for(const result of results) if(result.status==="fulfilled") { succeeded++;pool.push(...result.value); }
  }
  if(!succeeded) throw new Error("CATALOG_UNAVAILABLE");
  return buildDiscoveryRows([...new Map(pool.map(i=>[titleKey(i),i])).values()],state,userId);
}
