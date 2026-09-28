import type { ContentItem, FilterQuery } from "../domain/types.js";
import type { TmdbRepository } from "../repositories/tmdb-repository.js";
import type { UserRepository } from "../repositories/user-repository.js";
import {canonicalConcept} from "./concepts.js";

export async function generateCandidates(catalog: TmdbRepository, state: Awaited<ReturnType<UserRepository["getRecommendationState"]>>, query: FilterQuery): Promise<ContentItem[]> {
  const options = { region: state.country, providerIds: query.providerIds.length ? query.providerIds : query.availabilityScope === "owned_services" ? state.ownedProviderIds : [], mediaType: query.mediaType, minRuntimeMinutes: query.minRuntimeMinutes, maxRuntimeMinutes: query.maxRuntimeMinutes, genres: query.genres, genreMatch:query.genreMatch, originalLanguages:query.originalLanguages };
  const genres = state.taste.filter((s)=>s.dimension === "genre" && s.score > .3 && s.confidence > .3).sort((a,b)=>b.score*b.confidence-a.score*a.confidence).slice(0,2).map((s)=>s.key);
  const jobs: Promise<ContentItem[]>[] = [catalog.discover(options)];
  if (query.similarTo && catalog.related) {
    jobs.push(catalog.search({query:query.similarTo,region:state.country}).then(async items=>{
      const seed=items.find(i=>i.title.toLowerCase()===query.similarTo!.toLowerCase()||i.originalTitle?.toLowerCase()===query.similarTo!.toLowerCase());
      return seed ? catalog.related!(seed.mediaType,seed.id,state.country) : [];
    }));
  }
  const relevantGenres=query.genres.length?query.genres:genres;
  const topics=[...new Set(state.taste.filter(s=>["keyword","theme"].includes(s.dimension)&&s.score>.3&&s.confidence>.3).sort((a,b)=>b.score*b.confidence-a.score*a.confidence).map(s=>canonicalConcept(s.key)))];
  const selectedTopics=query.keywords.length?query.keywords:topics.slice(0,4);
  // Separate sources preserve alternative interests; do not AND unrelated tastes
  // or force a story concept into a background genre preference.
  for(const topic of selectedTopics.slice(0,4))jobs.push(catalog.discover({...options,keywords:[topic],limit:8}));
  if (genres.length && !query.genres.length) jobs.push(catalog.discover({ ...options, genres }));
  // Broaden the pool, not the popularity weight. Both familiar and less obvious
  // candidates still have to earn their place through the same final ranking.
  jobs.push(catalog.discover({ ...options, genres:relevantGenres, sortBy:"popularity.desc", limit:6 }));
  jobs.push(catalog.discover({ ...options, genres:relevantGenres, page:2, limit:6 }));
  const seeds=[...state.favorites].sort((a,b)=>Number(b.reaction==="super_like")-Number(a.reaction==="super_like")||+b.updatedAt-+a.updatedAt);
  const offset=seeds.length>2?Math.floor(Date.now()/86_400_000)%seeds.length:0;
  for (const favorite of [...seeds.slice(offset),...seeds.slice(0,offset)].slice(0,2)) if (catalog.related) jobs.push(catalog.related(favorite.mediaType,favorite.tmdbId,state.country));
  if (state.saved.length) jobs.push(Promise.all(state.saved.slice(0,6).map((s)=>catalog.getTitle(s.mediaType,s.tmdbId,state.country,state.ownedProviderIds))).then((items)=>items.filter((i): i is ContentItem=>i !== null)));
  const results = await Promise.allSettled(jobs);
  const items = results.flatMap((r)=>r.status === "fulfilled" ? r.value : []);
  if (!items.length && results.every((r)=>r.status === "rejected")) throw new Error("CATALOG_UNAVAILABLE");
  const familiar=new Set(state.favorites.map(f=>`${f.mediaType}:${f.tmdbId}`));
  return [...new Map(items.map((i)=>[`${i.mediaType}:${i.id}`,i])).values()].filter(i=>!query.excludeWatched||!familiar.has(`${i.mediaType}:${i.id}`));
}
