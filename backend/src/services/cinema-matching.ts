import {normalizeSearch,titleRelevance} from './search-ranking.js';
import type {ContentItem} from '../domain/types.js';
import type {CinemaEntry} from '../domain/cinema.js';
import type {TmdbRepository} from '../repositories/tmdb-repository.js';

export function cinemaTitle(value:string){
  return normalizeSearch(value.replace(/\bhu\s+dub\b|\b(?:2d|3d|imax|4dx)\b|\b(?:dublat|subtitrat)\b/gi,'').replace(/^hu\s+/i,'').replace(/\s+(?:dub|encore|proiec[tț]ie special[aă])\s*$/i,''));
}
export type CinemaCandidate={item:ContentItem;aliases:string[]};
export function chooseCinemaMatch(entry:CinemaEntry,candidates:CinemaCandidate[]):ContentItem|null {
  const titles=[entry.title,entry.originalTitle??''].map(cinemaTitle).filter(Boolean);
  const accepted=candidates.filter(({item,aliases})=>{
    if(item.mediaType!=='movie')return false;
    const names=[item.title,item.originalTitle??'',...aliases].map(cinemaTitle).filter(Boolean);
    const exact=titles.some(t=>names.includes(t));
    const strong=exact||titles.some(t=>names.some(n=>titleRelevance(t,n)>=.9));
    if(!strong)return false;
    const director=!!item.director&&entry.directors.some(d=>normalizeSearch(d)===normalizeSearch(item.director!));
    const cast=entry.actors.filter(a=>item.cast.some(c=>normalizeSearch(a)===normalizeSearch(c))).length;
    // Production year is used only when the source explicitly provides it.
    // A cinema run's date/year NEVER supplies identity evidence.
    const year=entry.originalYear!==null&&item.year!==null&&Math.abs(entry.originalYear-item.year)<=1;
    if(entry.originalYear!==null&&item.year!==null&&!year)return false;
    return exact?(year||director||cast>=2):(director&&cast>=2);
  });
  const distinct=new Map(accepted.map(c=>[c.item.id,c.item]));
  return distinct.size===1?[...distinct.values()][0]!:null;
}

export class CinemaMatcher {
  private searches=new Map<string,Promise<Array<{id:number;title:string}>>>();
  private details=new Map<number,Promise<ContentItem|null>>();
  requests=0;
  constructor(private token:string,private catalog:TmdbRepository,private maxRequests=250,private known:CinemaCandidate[]=[]){}
  private search(query:string,language:string){
    const key=`${language}:${query}`;
    let pending=this.searches.get(key);
    if(!pending){pending=(async()=>{
      if(++this.requests>this.maxRequests)throw new Error('CINEMA_MATCH_BUDGET');
      const url=new URL('https://api.themoviedb.org/3/search/movie');
      url.searchParams.set('query',query);url.searchParams.set('language',language);url.searchParams.set('include_adult','false');
      const response=await fetch(url,{headers:{Authorization:`Bearer ${this.token}`},signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw new Error('CINEMA_TMDB_SEARCH_FAILED');
      const data=await response.json() as {results:Array<{id:number;title:string}>};
      if(!Array.isArray(data.results))throw new Error('CINEMA_TMDB_SCHEMA');
      return data.results.slice(0,20);
    })();this.searches.set(key,pending);}
    return pending;
  }
  async match(entry:CinemaEntry):Promise<ContentItem|null>{
    // Another chain's resolved original title can ground a localized title
    // missing from TMDb's aliases, but requires the SAME identity evidence.
    const known=chooseCinemaMatch(entry,this.known);
    if(known)return known;
    const queries=[{query:entry.originalTitle||entry.title,language:'en-US'},{query:entry.title,language:'ro-RO'}];
    const found=await Promise.all(queries.map(q=>this.search(cinemaTitle(q.query),q.language)));
    const candidates=new Map<number,string[]>();
    for(const row of found.flat()){
      if(!Number.isInteger(row.id)||!row.title)continue;
      if(![entry.title,entry.originalTitle??''].some(t=>t&&titleRelevance(cinemaTitle(t),cinemaTitle(row.title))>=.8))continue;
      candidates.set(row.id,[...(candidates.get(row.id)??[]),row.title]);
    }
    const exactTitles=[entry.title,entry.originalTitle??''].map(cinemaTitle).filter(Boolean);
    const exactIds=[...candidates].filter(([,aliases])=>aliases.some(a=>exactTitles.includes(cinemaTitle(a)))).map(([id])=>id);
    if(exactIds.length)for(const id of candidates.keys())if(!exactIds.includes(id))candidates.delete(id);
    // Too many plausible identities means ambiguity, not permission to pick
    // the most popular. Never silently truncate ambiguous candidates.
    if(candidates.size>6)return null;
    const detailed:CinemaCandidate[]=[];
    for(const [id,aliases] of candidates){
      if(!this.details.has(id)){
        if(++this.requests>this.maxRequests)throw new Error('CINEMA_MATCH_BUDGET');
        this.details.set(id,this.catalog.getTitle('movie',id,'RO'));
      }
      const item=await this.details.get(id);if(item)detailed.push({item,aliases});
    }
    const selected=chooseCinemaMatch(entry,detailed);
    if(selected)this.known.push({item:selected,aliases:[entry.title,entry.originalTitle??'']});
    return selected;
  }
}
