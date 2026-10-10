import type { ContentItem, FilterQuery } from "../domain/types.js";
import type { TmdbRepository,DiscoverOptions } from "../repositories/tmdb-repository.js";
import type { UserRepository } from "../repositories/user-repository.js";
import {canonicalConcept} from "./concepts.js";

type State=Awaited<ReturnType<UserRepository['getRecommendationState']>>;
export function personalizedSources(catalog:TmdbRepository,state:State,options:DiscoverOptions):Promise<ContentItem[]>[] {
 const jobs:Promise<ContentItem[]>[]=[];
 // Verified conversational examples supplement retrieval; final ranking still enforces all filters.
 const examples=state.taste.filter(s=>s.example&&s.score>.3&&s.confidence>.5).sort((a,b)=>b.score*b.confidence-a.score*a.confidence).slice(0,2);
 if(catalog.related)for(const signal of examples)jobs.push(catalog.related(signal.example!.mediaType,signal.example!.tmdbId,state.country));
 const targetedLimit=jobs.length+2;
 const interests=state.taste.filter(s=>['language','country','combination'].includes(s.dimension)&&s.score>.3&&s.confidence>.5).sort((a,b)=>b.score*b.confidence-a.score*a.confidence);
 for(const interest of interests){
   if(jobs.length>=targetedLimit)break;
   const conditions=interest.conditions??[{dimension:interest.dimension,values:[interest.key]}];
   const values=(dimension:string)=>conditions.find(c=>c.dimension===dimension)?.values;
   const query:DiscoverOptions={...options,limit:12};let targeted=false;
   if(values('country')?.length){query.originCountries=values('country')!.map(c=>c.toUpperCase());targeted=true;}
   if(values('language')?.length&&!options.originalLanguages?.length){query.originalLanguages=values('language')!;targeted=true;}
   if(values('genre')?.length&&!options.genres?.length){query.genres=values('genre')!;targeted=true;}
   if(values('keyword')?.length&&!options.keywords?.length){query.keywords=values('keyword')!;targeted=true;}
   if(targeted)jobs.push(catalog.discover(query));
 }
 const person=state.taste.filter(s=>['actor','director'].includes(s.dimension)&&s.score>.3&&s.confidence>.5).sort((a,b)=>b.score*b.confidence-a.score*a.confidence)[0];
 if(person&&catalog.people&&catalog.knowledge)jobs.push((async()=>{
   const people=(await catalog.people!(person.key)).filter(p=>p.name.toLowerCase()===person.key.toLowerCase());
   if(people.length!==1)return [];
   const credits=await catalog.knowledge!('person',people[0]!.id);
   const records=(person.dimension==='actor'?credits.cast:credits.crew) as Array<{id:number;mediaType?:string;job?:string}>|undefined;
   const ids=(records??[]).filter(c=>Number.isInteger(c.id)&&(person.dimension==='actor'||c.job==='Director')).slice(0,6);
   const titles=await Promise.allSettled(ids.map(c=>catalog.getTitle(c.mediaType==='tv'?'series':'movie',c.id,state.country,state.ownedProviderIds)));
   return titles.flatMap(r=>r.status==='fulfilled'&&r.value?[r.value]:[]);
 })());
 return jobs;
}

export async function generateCandidates(catalog: TmdbRepository, state: Awaited<ReturnType<UserRepository["getRecommendationState"]>>, query: FilterQuery,referenceTitle?:ContentItem,page=1): Promise<ContentItem[]> {
  const options = { region: state.country, providerIds: query.providerIds.length ? query.providerIds : query.availabilityScope === "owned_services" ? state.ownedProviderIds : [], mediaType: query.mediaType, minRuntimeMinutes: query.minRuntimeMinutes, maxRuntimeMinutes: query.maxRuntimeMinutes, genres: query.genres, genreMatch:query.genreMatch, originalLanguages:query.originalLanguages };
  const genres = state.taste.filter((s)=>s.dimension === "genre" && s.score > .3 && s.confidence > .3).sort((a,b)=>b.score*b.confidence-a.score*a.confidence).slice(0,2).map((s)=>s.key);
  const retrievalOptions=referenceTitle&&!query.genres.length?{...options,page,genres:referenceTitle.genres,genreMatch:'any' as const}:{...options,page};
  const jobs: Promise<ContentItem[]>[] = [catalog.discover(retrievalOptions)];
  // Explicit language interests need a retrieval source, not just a score bonus
  // applied after an English-heavy popular pool has already been chosen.
  if(!query.similarTo)jobs.push(...personalizedSources(catalog,state,options));
  if (query.similarTo && catalog.related) {
    jobs.push((referenceTitle?Promise.resolve([referenceTitle]):catalog.search({query:query.similarTo,region:state.country})).then(async items=>{
      const seed=referenceTitle??items.find(i=>i.title.toLowerCase()===query.similarTo!.toLowerCase()||i.originalTitle?.toLowerCase()===query.similarTo!.toLowerCase());
      if(!seed)return [];
      const pages=await Promise.all([catalog.related!(seed.mediaType,seed.id,state.country,20),...(page>1?[catalog.related!(seed.mediaType,seed.id,state.country,20,page)]:[])]);
      return pages.flat();
    }));
  }
  const relevantGenres=query.genres.length?query.genres:genres;
  const topics=[...new Set(state.taste.filter(s=>["keyword","theme"].includes(s.dimension)&&s.score>.3&&s.confidence>.3).sort((a,b)=>b.score*b.confidence-a.score*a.confidence).map(s=>canonicalConcept(s.key)))];
  const selectedTopics=query.keywords.length?query.keywords:query.similarTo?[]:topics.slice(0,4);
  // Separate sources preserve alternative interests; do not AND unrelated tastes
  // or force a story concept into a background genre preference.
  for(const topic of selectedTopics.slice(0,4))jobs.push(catalog.discover({...options,page,keywords:[topic],limit:8}));
  if (!query.similarTo && genres.length && !query.genres.length) jobs.push(catalog.discover({ ...options, genres }));
  // Broaden the pool, not the popularity weight. Both familiar and less obvious
  // candidates still have to earn their place through the same final ranking.
  jobs.push(catalog.discover({ ...retrievalOptions, genres:query.similarTo?retrievalOptions.genres:relevantGenres, sortBy:"popularity.desc", limit:6 }));
  jobs.push(catalog.discover({ ...retrievalOptions, genres:query.similarTo?retrievalOptions.genres:relevantGenres, page:Math.min(500,page+1), limit:6 }));
  const seeds=[...state.favorites].sort((a,b)=>Number(b.reaction==="super_like")-Number(a.reaction==="super_like")||+b.updatedAt-+a.updatedAt);
  const offset=seeds.length>2?Math.floor(Date.now()/86_400_000)%seeds.length:0;
  for (const favorite of (query.similarTo?[]:[...seeds.slice(offset),...seeds.slice(0,offset)].slice(0,2))) if (catalog.related) jobs.push(catalog.related(favorite.mediaType,favorite.tmdbId,state.country));
  if (!query.similarTo && state.saved.length) jobs.push(Promise.all(state.saved.slice(0,6).map((s)=>catalog.getTitle(s.mediaType,s.tmdbId,state.country,state.ownedProviderIds))).then((items)=>items.filter((i): i is ContentItem=>i !== null)));
  const results = await Promise.allSettled(jobs);
  const items = results.flatMap((r)=>r.status === "fulfilled" ? r.value : []);
  if (!items.length && results.every((r)=>r.status === "rejected")) throw new Error("CATALOG_UNAVAILABLE");
  const familiar=new Set(state.favorites.map(f=>`${f.mediaType}:${f.tmdbId}`));
  return [...new Map(items.map((i)=>[`${i.mediaType}:${i.id}`,i])).values()].filter(i=>(!referenceTitle||i.id!==referenceTitle.id||i.mediaType!==referenceTitle.mediaType)&&(!query.excludeWatched||!familiar.has(`${i.mediaType}:${i.id}`)));
}
