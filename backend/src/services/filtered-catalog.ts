import { z } from "zod";
import { filterQuerySchema } from "../domain/types.js";
import type { TmdbRepository } from "../repositories/tmdb-repository.js";
import type { UserRepository } from "../repositories/user-repository.js";
import { rankCandidates } from "./recommendation.js";
import { watchedCandidates } from "./discovery.js";

export const catalogFilterSchema = z.object({
  mediaType: z.enum(["any", "movie", "series"]).default("any"),
  genre: z.enum(["Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery", "Romance", "Science Fiction", "Thriller", "War", "Western", "TV Movie", "Action & Adventure", "Kids", "News", "Reality", "Sci-Fi & Fantasy", "Soap", "Talk", "War & Politics"]).optional(),
  minMinutes: z.coerce.number().int().min(1).max(1440).optional(),
  maxMinutes: z.coerce.number().int().min(1).max(1440).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
  watchStatus: z.enum(["new", "again", "either"]).optional(),
  providerIds: z.string().regex(/^\d+(,\d+)*$/).max(500).transform(v => [...new Set(v.split(",").map(Number))]).refine(v => v.every(n => Number.isSafeInteger(n) && n > 0)).optional(),
}).strict().refine(q => q.minMinutes === undefined || q.maxMinutes === undefined || q.minMinutes <= q.maxMinutes,
  {message: "Minimum duration must not exceed maximum duration"})
  .refine(q => (q.minMinutes === undefined && q.maxMinutes === undefined) || q.mediaType === "movie",
    {message: "Duration filters apply to movies only"});

export async function filteredCatalog(catalog: TmdbRepository,
  state: Awaited<ReturnType<UserRepository["getRecommendationState"]>>, userId: string,
  input: z.infer<typeof catalogFilterSchema>) {
  const query = filterQuerySchema.parse({intent: "DISCOVERY", mediaType: input.mediaType,
    genres: input.genre ? [input.genre] : [], minRuntimeMinutes: input.minMinutes,
    maxRuntimeMinutes: input.maxMinutes,providerIds:input.providerIds,
    excludeWatched:input.watchStatus!=="again"&&input.watchStatus!=="either"});
  if(input.providerIds?.some(id=>!state.ownedProviderIds.includes(id))) return {data:[],meta:{page:input.page,hasMore:false}};
  // No AI or preference writes. Shared TMDB metadata remains cached; ranking is per viewer.
  const pool = input.watchStatus==="again" ? await watchedCandidates(catalog,state) : await catalog.discover({...query, region: state.country, providerIds: input.providerIds??state.ownedProviderIds,
    page: input.page, limit: 20});
  if(input.watchStatus==="either") pool.push(...await watchedCandidates(catalog,state));
  const ranked = rankCandidates(pool, query, {...state, viewerIds: [userId], temporaryMoods: []}, 40);
  return {data: ranked.map(r => r.item), meta: {page: input.page,
    // Keep paging even if some candidates were removed by hard filters.
    hasMore: input.watchStatus!=="again" && catalog.mode === "live" && pool.length > 0 && input.page < 500}};
}
