import type { ContentItem, FilterQuery, RankedContent, RecommendationEvidence, TasteSignal } from "../domain/types.js";
import { aggregateEvidence, evidenceWeight, titleDimensions } from "./taste.js";
import { canonicalTrait, contentTraits } from "./content-traits.js";
import {canonicalConcept,conceptEvidence} from "./concepts.js";
export { signalStrength } from "./taste.js";

export interface RecommendationContext {
  viewerIds: string[]; taste: TasteSignal[]; temporaryMoods: string[]; ownedProviderIds: number[];
  watchedIds: Set<number>; watchlistIds: Set<number>;
  watchedKeys?: Set<string>; watchlistKeys?: Set<string>; rejectedKeys?: Set<string>;
  recentlyShown?: Map<string, number>;
  ratedKeys?: Set<string>;
  seenHints?: Array<{dimension:string;key:string}>;
  wantHints?: Array<{dimension:string;key:string}>;
  behaviorPersonalization?: boolean;
}
export const rankingWeights = { taste: 4, negative: 6, session: 5, availability: 3, unavailable: -2, quality: 1, popularity: .15, watchlist: .2, repetition: 2.5, diversity: .8, seenHint:.12 } as const;
export const titleKey = (item: Pick<ContentItem, "mediaType" | "id">) => `${item.mediaType}:${item.id}`;
const normalized = (s: string) => s.toLowerCase().trim();

export function scoreCandidate(item: ContentItem, query: FilterQuery, context: RecommendationContext): RankedContent | null {
  const key = titleKey(item); const exact = query.intent === "TITLE_LOOKUP" || query.intent === "AVAILABILITY_LOOKUP";
  const watched = context.watchedKeys ? context.watchedKeys.has(key) : context.watchedIds.has(item.id);
  // Rated means familiar, not necessarily seen. Never manufacture history.
  if (!exact && ((query.excludeWatched && (watched || context.ratedKeys?.has(key))) || context.rejectedKeys?.has(key))) return null;
  if (!exact && query.mediaType !== "any" && item.mediaType !== query.mediaType) return null;
  if(!exact&&query.originalLanguages.length&&!query.originalLanguages.includes(item.originalLanguage??""))return null;
  if(!exact&&query.excludedKeywords.some(k=>conceptEvidence(item,k)))return null;
  if(!exact&&query.keywordMatch==="all"&&query.keywords.length&&!query.keywords.every(k=>conceptEvidence(item,k)))return null;
  if (!exact && query.genres.length && !(query.genreMatch==="all"?query.genres.every((g) => item.genres.map(normalized).includes(normalized(g))):query.genres.some((g) => item.genres.map(normalized).includes(normalized(g))))) return null;
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
  const matches = context.taste.filter((s) => dimensions.has(`${s.dimension}:${canonicalTrait(s.key)}`)||(["keyword","theme"].includes(s.dimension)&&conceptEvidence(item,s.key)));
  const positives = matches.filter((s) => s.score > 0).sort((a,b) => b.score*b.confidence-a.score*a.confidence).slice(0,3);
  // Strongest match leads; two supporting matches give diminishing bonuses.
  // Averaging matches made an extra valid match perversely lower a title's score.
  positives.forEach((s,index)=>add(`${s.confidence >= .5 ? "taste" : "tentative"}:${s.dimension}`, `${s.key} fits your taste`, s.score*s.confidence*rankingWeights.taste*[1,.35,.15][index]!));
  for (const s of matches.filter((s) => s.score < 0 && s.confidence >= .35).sort((a,b)=>a.score*a.confidence-b.score*b.confidence).slice(0,3)) add(`negative:${s.dimension}`, `less aligned with your preference about ${s.key}`, s.score*s.confidence*rankingWeights.negative);
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
  const reasons = evidence.filter((e) => e.weight > .1 && !e.code.startsWith("quality:") && !e.code.startsWith("tentative:")).sort((a,b)=>b.weight-a.weight).slice(0,2);
  return { item: { ...item, availability: item.availability.map((a) => ({ ...a, owned: context.ownedProviderIds.includes(a.providerId) })) }, score, evidence, reason: reasons.length ? `Because ${reasons.map((e)=>e.label).join(" and ")}.` : "A catalog discovery pick; there is not enough preference evidence for a personal explanation yet." };
}

function similarity(a: ContentItem, b: ContentItem): number {
  const aa = new Set(a.genres.map(normalized)), bb = new Set(b.genres.map(normalized));
  const shared = [...aa].filter((g)=>bb.has(g)).length;
  return Math.max(shared / Math.max(1, new Set([...aa,...bb]).size), a.collection && a.collection === b.collection ? 1 : 0);
}
export function rankCandidates(items: ContentItem[], query: FilterQuery, context: RecommendationContext, limit = 12): RankedContent[] {
  const unique = [...new Map(items.map((i)=>[titleKey(i),i])).values()];
  const remaining = unique.map((i)=>scoreCandidate(i,query,context)).filter((r): r is RankedContent => r !== null).sort((a,b)=>b.score-a.score);
  // When we have supported topical matches, do not pad a specific request with
  // unrelated popular films. A shorter honest set is preferable to filler.
  if(query.keywords.length&&remaining.some(r=>r.evidence.some(e=>e.code==="session:concept"))) {
    for(let i=remaining.length-1;i>=0;i--)if(!remaining[i]!.evidence.some(e=>e.code==="session:concept"))remaining.splice(i,1);
  }
  const selected: RankedContent[] = [];
  const interests=context.taste.filter(s=>["keyword","theme"].includes(s.dimension)&&s.score>.3&&s.confidence>=.5).map(s=>canonicalConcept(s.key));
  const topics=new Map(remaining.map(r=>[titleKey(r.item),new Set(interests.filter(t=>conceptEvidence(r.item,t)))]));
  const conceptOverlap=(a:ContentItem,b:ContentItem)=>{
    const aa=topics.get(titleKey(a))!,bb=topics.get(titleKey(b))!;
    const common=[...aa].filter(t=>bb.has(t)).length;
    return common/Math.max(1,new Set([...aa,...bb]).size);
  };
  while (remaining.length && selected.length < limit) {
    let best = 0, bestValue = -Infinity;
    remaining.forEach((r,index)=>{ const overlap = Math.max(0,...selected.map((s)=>Math.max(similarity(r.item,s.item),conceptOverlap(r.item,s.item)))); const value = r.score-rankingWeights.diversity*overlap; if (value>bestValue) { best=index; bestValue=value; } });
    selected.push(remaining.splice(best,1)[0]!);
  }
  return selected;
}
export function updateTasteSignal(existing: TasteSignal | undefined, strength: number, source: string): TasteSignal {
  return aggregateEvidence(existing?.dimension ?? "inferred", existing?.key ?? "unknown", [{ id: source, source, score: strength, weight: evidenceWeight(source), explicit: !["search","detail_open","watchlist"].includes(source), at: new Date().toISOString() }]);
}
