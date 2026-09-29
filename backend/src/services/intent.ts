import { filterQuerySchema, type FilterQuery } from "../domain/types.js";
import {mentionedConcepts} from "./concepts.js";
import {guardIntent} from "./intent-guards.js";

const exactAvailability = /^(where (can|could) i watch|is .* (on|available)|where is)\b/i;
const discoveryWords = /\b(good|recommend|something|anything|movie|show|thriller|comedy|horror|funny|tense|light|watch tonight)\b/i;

export function detectSearchIntent(input: string): FilterQuery {
  const query = input.trim();
  const lower = query.toLowerCase().replace(/\bone\s+hour/g,"1 hour").replace(/\btwo\s+hours/g,"2 hours").replace(/\bthree\s+hours/g,"3 hours");
  const availability = exactAvailability.test(query);
  const looksDiscovery = !query || /what should i watch|pick for me|surprise me|^(?:please )?(?:recommend|suggest|give me|show me|something|anything)|^i (?:have|want|am)\b|^(?:movies?|films?|shows?) about\b/i.test(query) || (mentionedConcepts(query).length>0&&/\b(movies?|films?|stories|recommend|something)\b/i.test(query)) || (discoveryWords.test(query) && (/\b(good|recommend|something|anything|under|less than|tonight)\b/i.test(query)));
  const person = /^(movies|shows|films) (with|by|starring)\s+/i.test(query);
  const runtime = lower.match(/(?:under|less than)\s+(\d+)\s*(?:minutes?|mins?|m)\b/);
  const hours = lower.match(/(?:under|less than)\s+(\d+(?:\.\d+)?)\s*hours?\b/);
  const providerMap: Record<string, number> = { netflix: 8, max: 1899, "disney+": 337, disney: 337, prime: 119, skyshowtime: 1773 };
  const providerIds = Object.entries(providerMap).filter(([name]) => lower.includes(name)).map(([, id]) => id);
  const moods = ["tense", "light", "funny", "dark", "cerebral", "cozy", "intense", "weird"].filter((mood) => lower.includes(mood));
  const excludedMoods = ["depressing", "heavy", "scary", "violent"].filter((mood) => new RegExp(`(?:not|nothing|don't want anything)\\s+${mood}`).test(lower));
  const allProviders = /even if i (don't|do not) subscribe|outside my subscriptions|all providers|any service/.test(lower);
  const concepts=mentionedConcepts(query);
  const excludedKeywords=concepts.filter(k=>new RegExp(`(?:no|not|without|avoid)[^.!]{0,25}${k.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}`,"i").test(query));
  return filterQuerySchema.parse({
    intent: availability ? "AVAILABILITY_LOOKUP" : person ? "PERSON_LOOKUP" : looksDiscovery ? "DISCOVERY" : "TITLE_LOOKUP",
    query: availability ? query.replace(/^where (?:can|could) i watch\s+/i, "").replace(/[?!.]+$/, "").trim() : query,
    availabilityScope: availability || allProviders || !looksDiscovery ? "all_providers" : "owned_services",
    providerIds,
    mediaType: /\b(movie|movies|film|films)\b/i.test(query) ? "movie" : /\b(series|shows)\b/i.test(query) ? "series" : "any",
    similarTo: query.match(/(?:something|movies?|films?|shows?) like (.+?)(?: but\b| with\b| under\b| on\b|$)/i)?.[1]?.trim() ?? null,
    genres: ["horror","comedy","thriller","drama","romance","animation","documentary","science fiction"].filter((g)=>lower.includes(g)),
    maxRuntimeMinutes: runtime ? Number(runtime[1]) : hours ? Math.round(Number(hours[1]) * 60) : null,
    minRuntimeMinutes: Number(lower.match(/(?:at least|minimum)\s+(\d+)\s*(?:minutes?|mins?)\b/)?.[1]) || null,
    moods,
    excludedMoods,
    keywords:concepts.filter(k=>!excludedKeywords.includes(k)),excludedKeywords,
    originalLanguages:/\b(?:originally in japanese|only (?:movies (?:originally )?in )?japanese|japanese-language|original language japanese)\b/i.test(query)?["ja"]:[],
  });
}

export function isPersistentPreference(input: string): boolean {
  return /\b(generally|usually|always|in general|i (?:like|love|hate|dislike|prefer|(?:don['’]?t|do not) (?:like|enjoy)|am not into)|i['’]m not into)\b/i.test(input) && !/\b(tonight|right now|today|this time)\b/i.test(input) && !/\b(if i|would i|could i)\b/i.test(input);
}

export function fallbackIntent(message:string,previous?:Partial<FilterQuery>):FilterQuery {
  const current=detectSearchIntent(message);
  if(!previous || !/^(other|more|something|instead|same|under|less|not|show all|actually)/i.test(message.trim())) return guardIntent(message,current,previous);
  return guardIntent(message,filterQuerySchema.parse({...previous,intent:"DISCOVERY",query:message,
    ...(current.genres.length?{genres:current.genres}:{}),
    ...(current.moods.length?{moods:current.moods}:{}),
    ...(current.excludedMoods.length?{excludedMoods:current.excludedMoods}:{}),
    ...(current.keywords.length?{keywords:current.keywords}:{}),
    ...(current.excludedKeywords.length?{excludedKeywords:current.excludedKeywords}:{}),
    ...(current.originalLanguages.length?{originalLanguages:current.originalLanguages}:{}),
    ...(current.maxRuntimeMinutes?{maxRuntimeMinutes:current.maxRuntimeMinutes}:{}),
    ...(current.providerIds.length?{providerIds:current.providerIds}:{}),
    ...(/show all services|all providers|outside my subscriptions/i.test(message)?{availabilityScope:"all_providers",providerIds:[]}:{}),
    ...(/no time limit|any length/i.test(message)?{maxRuntimeMinutes:null,minRuntimeMinutes:null}:{}),
  }),previous);
}
