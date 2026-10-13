import type {TasteSignal} from '../domain/types.js';
import type {EpgService} from './epg/service.js';
import {normalizeEpgTitle} from './epg/xmltv.js';
export type TvListing=Awaited<ReturnType<EpgService['listWindow']>>[number];
// Exact normalized placeholders, not fuzzy title matching: a real film called
// "Off Air: ..." must not disappear because of a substring.
export function isOffAir(title:string){
  return /^(fara emisie|fara program|no broadcast|no transmission|off air|no programming|programmes resume at \d+|sendepause|fin des programmes|no information|no listings available|no epg)$/.test(normalizeEpgTitle(title));
}
export function shortlistTv(programs:TvListing[],taste:TasteSignal[],limit=64){
  const useful=programs.filter(p=>!isOffAir(p.title));
  const score=(p:TvListing)=>{
    const hay=` ${normalizeEpgTitle([p.title,p.category,p.description].filter(Boolean).join(' '))} `;
    let value=(p.favorite?1.5:0)+(p.description?.length?0.25:0);
    for(const s of taste){
      // Conditions, countries, actors etc need richer verified metadata; do not
      // infer nationality or genre exclusions from a programme's title.
      if(s.conditions?.length||!['genre','keyword','mood','story'].includes(s.dimension))continue;
      const key=normalizeEpgTitle(s.key);if(key.length>2&&hay.includes(` ${key} `))value+=s.score*s.confidence*3;
    }
    return value;
  };
  const sorted=useful.sort((a,b)=>score(b)-score(a)||+a.startAt-+b.startAt||a.id.localeCompare(b.id));
  const pick=(rows:TvListing[],n:number)=>{
    const names=new Set<string>(),perChannel=new Map<string,number>();const out:TvListing[]=[];
    for(const p of rows){const key=normalizeEpgTitle(p.title);if(names.has(key)||(perChannel.get(p.channel.id)??0)>=2)continue;
      names.add(key);perChannel.set(p.channel.id,(perChannel.get(p.channel.id)??0)+1);out.push(p);if(out.length>=n)break;}
    return out;
  };
  // Reserve exploration candidates, rather than letting many favourites consume
  // every model input. Final selections still depend on the current request.
  const exploration=pick(sorted.filter(p=>!p.favorite),Math.floor(limit/3));
  const main=pick(sorted,limit-exploration.length);
  return [...new Map([...main,...exploration].map(p=>[p.id,p])).values()];
}
