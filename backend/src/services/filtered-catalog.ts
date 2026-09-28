import { z } from "zod";
import { filterQuerySchema } from "../domain/types.js";
import type { TmdbRepository } from "../repositories/tmdb-repository.js";
import type { UserRepository } from "../repositories/user-repository.js";
import { rankCandidates } from "./recommendation.js";

export const catalogFilterSchema = z.object({
  mediaType: z.enum(["any", "movie", "series"]).default("any"),
  genre: z.enum(["Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery", "Romance", "Science Fiction", "Thriller", "War", "Western", "TV Movie", "Action & Adventure", "Kids", "News", "Reality", "Sci-Fi & Fantasy", "Soap", "Talk", "War & Politics"]).optional(),
  minMinutes: z.coerce.number().int().min(1).max(1440).optional(),
  maxMinutes: z.coerce.number().int().min(1).max(1440).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
}).strict().refine(q => q.minMinutes === undefined || q.maxMinutes === undefined || q.minMinutes <= q.maxMinutes,
  {message: "Minimum duration must not exceed maximum duration"})
  .refine(q => (q.minMinutes === undefined && q.maxMinutes === undefined) || q.mediaType === "movie",
    {message: "Duration filters apply to movies only"});

export async function filteredCatalog(catalog: TmdbRepository,
  state: Awaited<ReturnType<UserRepository["getRecommendationState"]>>, userId: string,
  input: z.infer<typeof catalogFilterSchema>) {
  const query = filterQuerySchema.parse({intent: "DISCOVERY", mediaType: input.mediaType,
    genres: input.genre ? [input.genre] : [], minRuntimeMinutes: input.minMinutes,
    maxRuntimeMinutes: input.maxMinutes});
  // No AI or preference writes. Shared TMDB metadata remains cached; ranking is per viewer.
  const pool = await catalog.discover({...query, region: state.country, providerIds: state.ownedProviderIds,
    page: input.page, limit: 20});
  const ranked = rankCandidates(pool, query, {...state, viewerIds: [userId], temporaryMoods: []}, 40);
  return {data: ranked.map(r => r.item), meta: {page: input.page,
    // Keep paging even if some candidates were removed by hard filters.
    hasMore: catalog.mode === "live" && pool.length > 0 && input.page < 500}};
}
