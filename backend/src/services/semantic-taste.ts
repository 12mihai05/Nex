import { createHash } from 'node:crypto';
import type { ContentItem, TasteSignal } from '../domain/types.js';
import { canonicalTrait,canonicalDimensionTrait } from './content-traits.js';
import { conceptEvidence, conceptMeaning } from './concepts.js';
import { titleDimensions } from './taste.js';

export const directTaste = (s: TasteSignal) => ['explicit_edit','chat_explicit','onboarding_explicit','onboarding_text'].includes(s.source);
export const semanticHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value,(_key,v:unknown)=>v instanceof Set?[...v].sort():v instanceof Map?[...v].sort():v)).digest('hex');

export function unitVector(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > 3072 || value.some(n=>typeof n!=='number'||!Number.isFinite(n))) return null;
  const magnitude=Math.sqrt(value.reduce((sum,n)=>sum+n*n,0));
  return magnitude > 1e-10 ? value.map(n=>n/magnitude) : null;
}
export function cosine(a: number[], b: number[]) {
  if (a.length!==b.length) return 0;
  return Math.max(-1, Math.min(1,a.reduce((sum,n,i)=>sum+n*b[i]!,0)));
}

// Title/actor names, popularity and ratings are deliberately not semantic features.
export function semanticTitleText(item: ContentItem) {
  return [`Premise: ${item.overview.slice(0,1600)}`, `Topics: ${item.keywords.slice(0,30).join(', ')}`, `Genres: ${item.genres.join(', ')}`, `Supported tone: ${item.moods.join(', ')}`].join('\n').slice(0,2400);
}
export function conditionApplies(item: ContentItem, signal: TasteSignal) {
  const dimensions=new Set(titleDimensions(item).map(d=>`${d.dimension}:${canonicalTrait(d.key)}`));
  return !signal.conditions?.length || signal.conditions.every(c=>c.values.some(v=>dimensions.has(`${c.dimension}:${canonicalDimensionTrait(c.dimension,v)}`)||(c.dimension==='keyword'&&Boolean(conceptEvidence(item,v)))));
}
export function semanticSignals(taste: TasteSignal[]) {
  // Explicit open-ended preferences only. Do not turn inferred actor/country traits into stories.
  return taste.filter(s=>directTaste(s)&&Math.abs(s.score)>.1&&s.confidence>=.35&&['story','keyword','theme','mood'].includes(s.dimension))
    .sort((a,b)=>Math.abs(b.score)*b.confidence-Math.abs(a.score)*a.confidence||`${a.dimension}:${a.key}`.localeCompare(`${b.dimension}:${b.key}`)).slice(0,32);
}
export function semanticPreferenceMeaning(signal:TasteSignal) {
  if(signal.meaning && signal.meaning.trim().toLowerCase()!==signal.key.trim().toLowerCase())return signal.meaning;
  return ['keyword','theme'].includes(signal.dimension)?conceptMeaning(signal.key):signal.meaning||signal.key;
}
export interface Interest {key: string; label: string; vector: number[]; strength: number; signal?: TasteSignal; }

export function favouriteInterests(examples: Array<{item: ContentItem; vector: number[]; reaction: string}>): Interest[] {
  const groups: Array<{members: typeof examples; vector: number[]}> = [];
  for (const example of examples) {
    // Complete-link grouping avoids merging distinct interests via a chain of weak similarities.
    const group=groups.find(g=>g.members.every(m=>cosine(m.vector,example.vector)>=.72));
    if(group){group.members.push(example);group.vector=unitVector(group.members[0]!.vector.map((_,i)=>group.members.reduce((n,m)=>n+m.vector[i]!,0)))!;}
    else groups.push({members:[example],vector:example.vector});
  }
  return groups.map(g=>({key:`favourite:${g.members.map(m=>`${m.item.mediaType}:${m.item.id}`).sort().join(',')}`,label:`titles you ${g.members.some(m=>m.reaction==='super_like')?'super-liked':'liked'}`,
    vector:g.vector,strength:(g.members.some(m=>m.reaction==='super_like')?.75:.5)+Math.min(.15,(new Set(g.members.map(m=>m.item.collection||`${m.item.mediaType}:${m.item.id}`)).size-1)*.05)}));
}

export function semanticAdjustment(item: ContentItem, vector: number[], interests: Interest[]) {
  const applicable=interests.filter(i=>!i.signal||conditionApplies(item,i.signal));
  // Similarity is uncalibrated. A floor and a bounded contribution prevent tiny matches winning.
  const match=(i:Interest)=>Math.max(0,Math.min(1,(cosine(vector,i.vector)-.25)/.5))*i.strength;
  const positives=applicable.filter(i=>i.strength>0).map(i=>({interest:i,value:match(i)})).sort((a,b)=>b.value-a.value);
  const negatives=applicable.filter(i=>i.strength<0).map(i=>({interest:i,value:match({...i,strength:Math.abs(i.strength)})})).sort((a,b)=>b.value-a.value);
  const boost=Math.min(4,(positives[0]?.value??0)*3.5+(positives[1]?.value??0)*.5);
  const penalty=Math.min(5,(negatives[0]?.value??0)*5);
  return {boost,penalty,positive:positives[0]?.interest,negative:negatives[0]?.interest};
}
