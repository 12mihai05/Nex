import type { FilterQuery } from "../domain/types.js";
import type { TmdbRepository } from "../repositories/tmdb-repository.js";
import type { UserRepository } from "../repositories/user-repository.js";
import { generateCandidates } from "./candidates.js";
import { watchedCandidates } from "./discovery.js";
import { rankCandidates } from "./recommendation.js";
import type { PersonalizationService } from './personalization.js';

export async function pickTitle(catalog:TmdbRepository,state:Awaited<ReturnType<UserRepository['getRecommendationState']>>,userId:string,
  filter:FilterQuery,watchStatus:'new'|'again'|'either',excludedIds:number[],personalizer?:PersonalizationService) {
  if(filter.providerIds.some(id=>!state.ownedProviderIds.includes(id))) return undefined;
  const query={...filter,excludeWatched:watchStatus==='new'};
  const candidates=watchStatus==='again' ? await watchedCandidates(catalog,state) : await generateCandidates(catalog,state,query);
  if(watchStatus==='either') candidates.push(...await watchedCandidates(catalog,state));
  const eligible=candidates.filter(i=>!excludedIds.includes(i.id));
  const personal=await personalizer?.prepare(eligible,state,userId,query);
  return rankCandidates(eligible,query,{...state,...personal,viewerIds:[userId],temporaryMoods:query.moods},1)[0];
}
