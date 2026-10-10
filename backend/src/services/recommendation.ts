import type { ContentItem, FilterQuery, RankedContent, RecommendationEvidence, TasteSignal } from "../domain/types.js";
import { aggregateEvidence, evidenceWeight, titleDimensions } from "./taste.js";
import { canonicalTrait, canonicalDimensionTrait, contentTraits, matchesGenre } from "./content-traits.js";
import {canonicalConcept,conceptEvidence} from "./concepts.js";
import {isExplicitExclusion} from './preference-exclusions.js';
import {tasteConditionsApply} from './taste-conditions.js';
export { signalStrength } from "./taste.js";

export interface RecommendationContext {
  // Request-local only: callers must use a fresh cache when user/query context
  // or semantic adjustments change. Never persist this across requests/users.
  scoreCache?: WeakMap<ContentItem,Map<string,RankedContent|null>>;
  viewerIds: string[]; taste: TasteSignal[]; temporaryMoods: string[]; ownedProviderIds: number[];
  watchedIds: Set<number>; watchlistIds: Set<number>;
  watchedKeys?: Set<string>; watchlistKeys?: Set<string>; rejectedKeys?: Set<string>;
  recentlyShown?: Map<string, number>;
  ratedKeys?: Set<string>;
  seenHints?: Array<{dimension:string;key:string}>;
  wantHints?: Array<{dimension:string;key:string}>;
  behaviorPersonalization?: boolean;
  personalAdjustments?: Map<string, RecommendationEvidence[]>;
}
export const rankingWeights = { taste: 4, negative: 6, session: 5, availability: 3, unavailable: -2, quality: 1, popularity: .15, watchlist: .2, repetition: 2.5, diversity: .8, seenHint:.12 } as const;
export const titleKey = (item: Pick<ContentItem, "mediaType" | "id">) => `${item.mediaType}:${item.id}`;
const normalized = (s: string) => s.toLowerCase().trim();

export function scoreCandidate(item: ContentItem, query: FilterQuery, context: RecommendationContext): RankedContent | null {
  if(!context.scoreCache)return scoreUncached(item,query,context);
  const key=JSON.stringify(query),cache=context.scoreCache.get(item)??new Map<string,RankedContent|null>();
  if(cache.has(key))return cache.get(key)!;
  const value=scoreUncached(item,query,context);cache.set(key,value);context.scoreCache.set(item,cache);return value;
}
function scoreUncached(item: ContentItem, query: FilterQuery, context: RecommendationContext): RankedContent | null {
  const key = titleKey(item); const exact = query.intent === "TITLE_LOOKUP" || query.intent === "AVAILABILITY_LOOKUP";
  if (!exact && item.releaseDate && item.releaseDate > new Date().toISOString().slice(0,10)) return null;
  const watched = context.watchedKeys ? context.watchedKeys.has(key) : context.watchedIds.has(item.id);
  // Rated means familiar, not necessarily seen. Never manufacture history.
  if (!exact && ((query.excludeWatched && (watched || context.ratedKeys?.has(key))) || context.rejectedKeys?.has(key))) return null;
  if (!exact && query.mediaType !== "any" && item.mediaType !== query.mediaType) return null;
  if(!exact&&context.taste.some(s=>isExplicitExclusion(s)&&tasteConditionsApply(item,s)&&
    (['keyword','theme'].includes(s.dimension)?item.keywords.some(k=>canonicalConcept(k)===canonicalConcept(s.key)):
      s.dimension==='combination'?(s.conditions?.length??0)>=2:
      titleDimensions(item).some(d=>d.dimension===s.dimension&&canonicalDimensionTrait(d.dimension,d.key)===canonicalDimensionTrait(s.dimension,s.key)))))return null;
  if(!exact&&query.originalLanguages.length&&!query.originalLanguages.includes(item.originalLanguage??""))return null;
  if(!exact&&query.excludedKeywords.some(k=>conceptEvidence(item,k)))return null;
  if(!exact&&query.keywordMatch==="all"&&query.keywords.length&&!query.keywords.every(k=>conceptEvidence(item,k)))return null;
  if (!exact && query.genres.length && !(query.genreMatch==="all"?query.genres.every((g) => item.genres.some(actual=>matchesGenre(g,actual))):query.genres.some((g) => item.genres.some(actual=>matchesGenre(g,actual))))) return null;
  if (!exact && query.maxRuntimeMinutes && (!item.runtimeMinutes || item.runtimeMinutes > query.maxRuntimeMinutes)) return null;
  if (!exact && query.minRuntimeMinutes && (!item.runtimeMinutes || item.runtimeMinutes < query.minRuntimeMinutes)) return null;
  const included = item.availability.find((a) => a.access === "included" && context.ownedProviderIds.includes(a.providerId));
  if (!exact && query.providerIds.length && !item.availability.some((a) => a.access === "included" && query.providerIds.includes(a.providerId))) return null;
  if (!exact && query.availabilityScope === "owned_services" && context.ownedProviderIds.length && !included) return null;
  let score = 0; const evidence: RecommendationEvidence[] = [];
  const add = (code: string, label: string, weight: number) => { score += weight; evidence.push({ code, label, weight }); };
  const keys = contentTraits(item);
  const dimensions = new Set(titleDimensions(item).map((d) => `${d.dimension}:${canonicalTrait(d.key)}`));
  for(const keyword of item.keywords) dimensions.add(`keyword:${canonicalTrait(keyword)}`);
  for(const trait of keys) dimensions.add(`mood:${trait}`);
  const applicable = context.taste.filter((s) => {
    if(s.dimension==='story')return false;
    const scoped=tasteConditionsApply(item,s,dimensions);
    // Conditions qualify a trait; only a combination is defined entirely by them.
    const trait=s.dimension==='combination'?(s.conditions?.length??0)>=2:
      dimensions.has(`${s.dimension}:${canonicalDimensionTrait(s.dimension,s.key)}`)||(["keyword","theme"].includes(s.dimension)&&conceptEvidence(item,s.key));
    return scoped&&trait;
  });
  // Legacy aliases (China/CN, kpop/k-pop) are one matched trait, not two votes.
  const uniqueMatches=new Map<string,TasteSignal>();
  for(const signal of applicable){
    const identity=`${Math.sign(signal.score)}:${signal.dimension}:${canonicalDimensionTrait(signal.dimension,signal.key)}`;
    const previous=uniqueMatches.get(identity);
    if(!previous||Math.abs(signal.score)*signal.confidence>Math.abs(previous.score)*previous.confidence)uniqueMatches.set(identity,signal);
  }
  const matches=[...uniqueMatches.values()];
  const positives = matches.filter((s) => s.score > 0).sort((a,b) => b.score*b.confidence-a.score*a.confidence).slice(0,3);
  // Strongest match leads; two supporting matches give diminishing bonuses.
  // Averaging matches made an extra valid match perversely lower a title's score.
  positives.forEach((s,index)=>add(`${s.confidence >= .5 ? "taste" : "tentative"}:${s.dimension}`, `${s.key} fits your taste`, s.score*s.confidence*rankingWeights.taste*[1,.35,.15][index]!));
  for (const s of matches.filter((s) => s.score < 0 && s.confidence >= .35).sort((a,b)=>a.score*a.confidence-b.score*b.confidence).slice(0,3)) {
    const direct=['explicit_edit','chat_explicit','onboarding_text','onboarding_explicit'].includes(s.source);
    // One disliked title is certain about that title, uncertain about its traits.
    const certainty=direct?1:Math.min(1,.35+.2*(s.evidenceCount-1));
    add(`negative:${s.dimension}`, `less aligned with your preference about ${s.key}`, s.score*s.confidence*rankingWeights.negative*certainty);
  }
  // One capped nudge, irrespective of library size. Explicit negative taste wins.
  if(!exact&&context.behaviorPersonalization!==false&&!matches.some(s=>s.score<0)) {
    const hintMatch=(s:{dimension:string;key:string})=>dimensions.has(`${s.dimension}:${canonicalTrait(s.key)}`)||(s.dimension==="keyword"&&Boolean(conceptEvidence(item,s.key)));
    const saved=context.watchlistKeys?context.watchlistKeys.has(key):context.watchlistIds.has(item.id);
    if(!context.ratedKeys?.has(key)&&(saved||context.wantHints?.some(hintMatch)))add("intent:watchlist","a small hint from your Want to see list",rankingWeights.watchlist);
    else if(context.seenHints?.some(hintMatch))add("history:weak_interest","a small hint from your unrated viewing history",rankingWeights.seenHint);
  }
  const requested = [...new Set([...query.moods, ...context.temporaryMoods].map(canonicalTrait))];
  const mood = requested.find((m) => keys.has(m));
  if (mood) add("session:mood", `catalog tags suggest a ${mood} fit`, rankingWeights.session);
  const topic=query.keywords.find(k=>conceptEvidence(item,k));
  if(topic)add("session:concept",`the catalog ${conceptEvidence(item,topic)==="tag"?"tags":"premise"} relates to ${canonicalConcept(topic)}`,rankingWeights.session);
  if (!exact && query.excludedMoods.some((m) => keys.has(normalized(m)))) return null;
  if (included) add("availability:owned", `included with ${included.providerName}`, rankingWeights.availability);
  else if (!exact) add("availability:unavailable", "no included availability confirmed on your services", rankingWeights.unavailable);
  const votes = item.voteCount ?? 0;
  const quality = ((item.rating ?? 6) * votes + 6 * 250) / (votes + 250) / 10;
  add("quality:shrunk", "catalog rating with vote-count adjustment", quality * rankingWeights.quality);
  score += Math.min(item.popularity / 100, 1) * rankingWeights.popularity;
  const shown = context.recentlyShown?.get(key);
  if (!exact && shown) add("fatigue:shown", "shown recently", -rankingWeights.repetition*Math.pow(.5, (Date.now()-shown)/86_400_000/3));
  if (!exact) for (const adjustment of context.personalAdjustments?.get(key) ?? []) {
    // A second layer can reorder eligible titles, never override hard filters.
    if (Number.isFinite(adjustment.weight)) add(adjustment.code, adjustment.label, adjustment.weight);
  }
  const reasons = evidence.filter((e) => e.weight > .1 && !e.code.startsWith("quality:") && !e.code.startsWith("tentative:")).sort((a,b)=>b.weight-a.weight).slice(0,2);
  return { item: { ...item, availability: item.availability.map((a) => ({ ...a, owned: context.ownedProviderIds.includes(a.providerId) })) }, score, evidence, reason: reasons.length ? `Because ${reasons.map((e)=>e.label).join(" and ")}.` : "A catalog discovery pick; there is not enough preference evidence for a personal explanation yet." };
}

export function rankCandidates(items: ContentItem[], query: FilterQuery, context: RecommendationContext, limit = 12): RankedContent[] {
  const unique = [...new Map(items.map((i)=>[titleKey(i),i])).values()];
  const remaining = unique.map((i)=>scoreCandidate(i,query,context)).filter((r): r is RankedContent => r !== null).sort((a,b)=>b.score-a.score);
  // A topical request must have evidence even when the entire pool misses it.
  // An empty result is more honest than silently substituting popular titles.
  if(query.intent==='DISCOVERY'&&query.keywords.length) {
    for(let i=remaining.length-1;i>=0;i--)if(!remaining[i]!.evidence.some(e=>e.code==="session:concept"))remaining.splice(i,1);
  }
  const selected: RankedContent[] = [];
  // Semantic adjustments have a smaller numerical range than legacy trait sums.
  // The old .8 penalty could promote an unrelated genre over a real story match.
  const diversityWeight=context.personalAdjustments?.size ? .24 : rankingWeights.diversity;
  const interests=context.taste.filter(s=>["keyword","theme"].includes(s.dimension)&&s.score>.3&&s.confidence>=.5).map(s=>canonicalConcept(s.key));
  const topics=new Map(remaining.map(r=>[titleKey(r.item),new Set(interests.filter(t=>conceptEvidence(r.item,t)))]));
  const genres=new Map(remaining.map(r=>[titleKey(r.item),new Set(r.item.genres.map(normalized))]));
  const overlap=(aa:Set<string>,bb:Set<string>)=>{
    let common=0;for(const key of aa)if(bb.has(key))common++;
    return common/Math.max(1,aa.size+bb.size-common);
  };
  const conceptOverlap=(a:ContentItem,b:ContentItem)=>{
    const aa=topics.get(titleKey(a))!,bb=topics.get(titleKey(b))!;
    return overlap(aa,bb);
  };
  // Incremental maximum is mathematically identical to scanning every previous
  // pick, without rebuilding genre sets and all pairwise comparisons each turn.
  const maxOverlap=new Map<RankedContent,number>();
  while (remaining.length && selected.length < limit) {
    let best = 0, bestValue = -Infinity;
    const last=selected.at(-1)?.item;
    remaining.forEach((r,index)=>{
      let similarity=maxOverlap.get(r)??0;
      if(last){similarity=Math.max(similarity,overlap(genres.get(titleKey(r.item))!,genres.get(titleKey(last))!),r.item.collection&&r.item.collection===last.collection?1:0,conceptOverlap(r.item,last));maxOverlap.set(r,similarity);}
      const value=r.score-diversityWeight*similarity;if(value>bestValue){best=index;bestValue=value;}
    });
    const winner=remaining.splice(best,1)[0]!;selected.push(winner);maxOverlap.delete(winner);
  }
  return selected;
}
export function updateTasteSignal(existing: TasteSignal | undefined, strength: number, source: string): TasteSignal {
  return aggregateEvidence(existing?.dimension ?? "inferred", existing?.key ?? "unknown", [{ id: source, source, score: strength, weight: evidenceWeight(source), explicit: !["search","detail_open","watchlist"].includes(source), at: new Date().toISOString() }]);
}
