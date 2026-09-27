import type {FilterQuery} from "../domain/types.js";
import {canonicalConcept,conceptTerms,mentionedConcepts} from "./concepts.js";

const genres=["action","adventure","animation","comedy","crime","documentary","drama","family","fantasy","history","horror","music","mystery","romance","science fiction","thriller","war","western"];
const has=(text:string,term:string)=>new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\b`,"i").test(text);
const negated=(text:string,term:string)=>new RegExp(`(?:no|not|without|avoid|rather than)[^,.!?]{0,30}\\b${term}\\b`,"i").test(text);

/** Guard explicit mechanical constraints; the model interprets nuanced concepts. */
export function guardIntent(message:string,parsed:FilterQuery,previous?:Partial<FilterQuery>):FilterQuery {
  const lower=message.toLowerCase().replace(/sci-fi/g,"science fiction").replace(/animated/g,"animation").replace(/documentaries/g,"documentary").replace(/comedies/g,"comedy").replace(/mysteries/g,"mystery").replace(/thrillers/g,"thriller");
  if(/\b(movie|movies|film|films)\b/.test(lower)&&! /\b(or shows|or series|and series)\b/.test(lower))parsed.mediaType="movie";
  if(/\b(only series|only shows|tv series)\b/.test(lower))parsed.mediaType="series";
  const genreText=lower.replace(/\blive[- ]action\b/g,"");
  const explicitGenres=genres.filter(g=>has(genreText,g)&&!negated(genreText,g)&&!(g==="family"&&/\b(found|chosen) family\b/.test(lower)));
  if(/\b(any genre|genre (?:does not|doesn't) matter)\b/.test(lower))parsed.genres=[];
  else if(explicitGenres.length)parsed.genres=explicitGenres;
  else parsed.genres=parsed.genres.filter(g=>previous?.genres?.some(p=>p.toLowerCase()===g.toLowerCase()));
  if(explicitGenres.length>1)parsed.genreMatch=/\bor\b/.test(lower)?"any":"all";
  parsed.keywords=parsed.keywords.filter(k=>!genres.includes(k.toLowerCase())).map(canonicalConcept);
  const conceptText=lower.replace(/science fiction/g,"");
  const explicitConcepts=mentionedConcepts(conceptText).filter(k=>!conceptTerms(k).some(t=>has(lower,t)&&negated(lower,t))&&!genres.includes(k));
  if(/\b(together|team|cooperation|collaboration)\b/.test(lower)&&/\b(problem|solve|solving|work|working)\b/.test(lower))explicitConcepts.push("teamwork");
  if(/\bsatire\b/.test(lower)&&/\b(class|wealth|rich|money)\b/.test(lower))explicitConcepts.push("class conflict");
  if(explicitConcepts.length)parsed.keywords=explicitConcepts;
  else if(previous?.keywords?.length&&/\b(keep|retain)\b[^.!?]*\b(theme|concept|story|stories|topic)\b/.test(lower))parsed.keywords=previous.keywords;
  else if(previous&&explicitGenres.length&&/\binstead\b/.test(lower)&&!/\b(keep|same|retain)\b[^.!?]*\b(theme|concept|story|stories|topic)\b/.test(lower))parsed.keywords=[];
  else if(previous?.keywords?.length&&/^(other|more|under|less|same|show|instead)/i.test(message.trim()))parsed.keywords=previous.keywords;
  parsed.keywords=[...new Set(parsed.keywords)];
  if(explicitConcepts.length>1&&/\b(both|combine|combines|combined|combining)\b/i.test(message))parsed.keywordMatch="all";
  if(explicitConcepts.length>1&&/\bor\b/i.test(message))parsed.keywordMatch="any";
  // Never silently add the prompt's example exclusions to the user's request.
  parsed.excludedKeywords=parsed.excludedKeywords.filter(k=>previous?.excludedKeywords?.includes(k)||conceptTerms(k).some(t=>has(lower,t))).map(canonicalConcept);
  for(const k of mentionedConcepts(message))if(conceptTerms(k).some(t=>has(lower,t)&&negated(lower,t)))parsed.excludedKeywords.push(k);
  for(const g of genres)if(has(lower,g)&&negated(lower,g))parsed.excludedKeywords.push(g);
  parsed.excludedKeywords=[...new Set(parsed.excludedKeywords)];
  parsed.keywords=parsed.keywords.filter(k=>!parsed.excludedKeywords.includes(k));
  if(!/\b(rewatch|watch again|include (?:movies|films|titles|ones) (?:i have |i've )?(?:already )?(?:seen|watched))\b/i.test(message))parsed.excludeWatched=previous?.excludeWatched??true;
  return parsed;
}
