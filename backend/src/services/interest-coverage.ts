import type {ContentItem,TasteSignal} from '../domain/types.js';
import {getConfig} from '../config.js';
import {canonicalConcept} from './concepts.js';

export const balancedTaste=()=>getConfig().RECOMMENDATION_PROFILE_VERSION==='balanced';

// Stable within a day. Keep the strongest anchor; rotate the rest so a long
// profile is not permanently represented by just its first few interests.
export function interestSeeds<T>(items:T[],limit:number,identity:(item:T)=>string,day=Math.floor(Date.now()/86_400_000)):T[]{
  const identities=new Set<string>();
  const unique=items.filter(i=>{const key=identity(i);if(identities.has(key))return false;identities.add(key);return true;});
  if(!balancedTaste()||unique.length<=limit)return unique.slice(0,limit);
  const rest=unique.slice(1),offset=day%rest.length;
  return [unique[0]!,...rest.slice(offset),...rest.slice(0,offset)].slice(0,limit);
}

export function positiveInterests(signals:TasteSignal[],limit:number){
  const sorted=signals.filter(s=>s.score>.3&&s.confidence>=.35)
    .sort((a,b)=>b.score*b.confidence-a.score*a.confidence||a.key.localeCompare(b.key));
  return interestSeeds(sorted,limit,s=>`${['keyword','theme'].includes(s.dimension)?'concept':s.dimension}:${canonicalConcept(s.key)}`);
}

// Selection uses metadata only when present. No extra provider calls just to
// choose seeds, and no assumption that one genre defines the user's taste.
export function representativeFavorites<T extends {tmdbId:number;mediaType:string;reaction:string;updatedAt:Date}>(favorites:T[],items:ContentItem[],limit:number):T[]{
  const sorted=[...favorites].sort((a,b)=>Number(b.reaction==='super_like')-Number(a.reaction==='super_like')||+b.updatedAt-+a.updatedAt);
  if(!balancedTaste())return sorted.slice(0,limit);
  const tail=sorted.slice(1),offset=tail.length?Math.floor(Date.now()/86_400_000)%tail.length:0;
  const remaining=sorted.length?[sorted[0]!,...tail.slice(offset),...tail.slice(0,offset)]:[],selected:T[]=[];
  const traits=(f:T)=>{
    const item=items.find(i=>i.id===f.tmdbId&&i.mediaType===f.mediaType);
    return new Set(item?[...item.genres.map(g=>`genre:${g}`),...item.keywords.slice(0,12).map(k=>`topic:${canonicalConcept(k)}`),...(item.collection?[`collection:${item.collection}`]:[])]:[]);
  };
  const covered=new Set<string>();
  while(remaining.length&&selected.length<limit){
    let best=0,bestValue=-Infinity;
    remaining.forEach((f,index)=>{
      const tags=traits(f),fresh=[...tags].filter(t=>!covered.has(t)).length/Math.max(1,tags.size);
      const value=fresh+(f.reaction==='super_like'?.25:0)-index*.005;
      if(value>bestValue){best=index;bestValue=value;}
    });
    const winner=remaining.splice(best,1)[0]!;selected.push(winner);traits(winner).forEach(t=>covered.add(t));
  }
  return selected;
}
