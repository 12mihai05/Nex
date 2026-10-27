import {createHash} from 'node:crypto';
import {z} from 'zod';
import {releaseDate} from './releases.js';

export const chains=['cinema_city','cineplexx'] as const;
export type CinemaChain=typeof chains[number];
export const chainNames:Record<CinemaChain,string>={cinema_city:'Cinema City',cineplexx:'Cineplexx'};
export type CinemaEntry={sourceId:string;title:string;originalTitle:string|null;originalYear:number|null;directors:string[];actors:string[];date:string|null;url:string;current:boolean;upcoming:boolean};
export type CinemaSnapshot={chain:CinemaChain;entries:CinemaEntry[];currentCount:number;upcomingCount:number;hash:string};
export const fingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function identityFingerprint(entry:CinemaEntry){return fingerprint([entry.title,entry.originalTitle,entry.originalYear,entry.directors,entry.actors]);}
export type CinemaListing={chain:CinemaChain;name:string;date:string|null;dateKind:'initial'|'reissue'|'unknown';status:'listed'|'upcoming'|'past';sourceUrl:string;checkedAt:string;firstObservedAt:string};
export type CinemaInfo={country:'RO';listings:CinemaListing[];dateConflict:boolean};

const short=z.string().min(1).max(500);
const maybeDate=z.string().nullish().transform(v=>{
  if(!v)return null;
  const date=releaseDate(v);
  if(!date)throw new Error('CINEMA_INVALID_DATE');
  return date;
});
const ccFeed=z.object({body:z.object({posters:z.array(z.object({code:short,featureTitle:short,url:z.string().url(),dateStarted:maybeDate})).min(1).max(1000)})});
const cpFeed=z.array(z.object({id:short,title:short,titleCalculated:z.string().optional(),titleOriginalCalculated:z.string().optional(),directors:z.array(z.string()).default([]),actors:z.array(z.string()).default([]),startDate:maybeDate,openingDate:maybeDate})).min(1).max(1000);

export function assertSourceUrl(url:string,chain:CinemaChain):string {
  const parsed=new URL(url);
  const allowed=chain==='cinema_city'?['www.cinemacity.ro']:['cineplexx.ro','www.cineplexx.ro'];
  if(parsed.protocol!=='https:'||!allowed.includes(parsed.hostname)||parsed.username||parsed.password||parsed.port)throw new Error('CINEMA_INVALID_SOURCE_URL');
  return parsed.href;
}

export function parseCinemaSnapshot(chain:CinemaChain,current:unknown,upcoming:unknown):CinemaSnapshot {
  const parse=(raw:unknown,isCurrent:boolean):CinemaEntry[]=>chain==='cinema_city'
    ?ccFeed.parse(raw).body.posters.map(r=>({sourceId:r.code,title:r.featureTitle.trim(),originalTitle:null,originalYear:null,directors:[],actors:[],date:r.dateStarted,url:assertSourceUrl(r.url,chain),current:isCurrent,upcoming:!isCurrent}))
    :cpFeed.parse(raw).map(r=>({sourceId:r.id,title:(r.titleCalculated||r.title).trim(),originalTitle:r.titleOriginalCalculated?.trim()||null,originalYear:null,directors:r.directors,actors:r.actors,date:r.startDate??r.openingDate,url:'https://www.cineplexx.ro/',current:isCurrent,upcoming:!isCurrent}));
  const a=parse(current,true),b=parse(upcoming,false),entries=new Map<string,CinemaEntry>();
  for(const list of [a,b]){
    if(new Set(list.map(e=>e.sourceId)).size!==list.length)throw new Error('CINEMA_DUPLICATE_SOURCE_ID');
    for(const entry of list){
      const previous=entries.get(entry.sourceId);
      if(previous&&(previous.date!==entry.date||previous.title!==entry.title))throw new Error('CINEMA_CONFLICTING_VARIANT');
      entries.set(entry.sourceId,previous?{...entry,current:previous.current||entry.current,upcoming:previous.upcoming||entry.upcoming}:entry);
    }
  }
  const rows=[...entries.values()].sort((a,b)=>a.sourceId.localeCompare(b.sourceId));
  return {chain,entries:rows,currentCount:a.length,upcomingCount:b.length,hash:fingerprint(rows)};
}

export function enrichCinemaCity(entry:CinemaEntry,html:string):CinemaEntry {
  // Read the site's JSON literal, never execute JavaScript or retain page text.
  const literal=html.match(/\bvar\s+filmDetails\s*=\s*(\{[^\n]+\});/);
  if(!literal)throw new Error('CINEMA_DETAIL_SCHEMA_CHANGED');
  const text=z.string().nullish().transform(v=>v??'');
  const data=z.object({id:short,originalName:text,releaseYear:text,directors:text,cast:text}).parse(JSON.parse(literal[1]!));
  if(data.id!==entry.sourceId)throw new Error('CINEMA_DETAIL_ID_MISMATCH');
  const year=Number(data.releaseYear);
  return {...entry,originalTitle:data.originalName||null,originalYear:Number.isInteger(year)&&year>=1888&&year<=2200?year:null,directors:data.directors.split(',').map(s=>s.trim()).filter(Boolean),actors:data.cast.split(',').map(s=>s.trim()).filter(Boolean)};
}

export function assertHealthySnapshot(snapshot:CinemaSnapshot,previous?:{currentCount:number;upcomingCount:number}|null){
  if(previous&&((previous.currentCount>=8&&snapshot.currentCount<previous.currentCount*.5)||(previous.upcomingCount>=8&&snapshot.upcomingCount<previous.upcomingCount*.5)))throw new Error('CINEMA_SUSPICIOUS_POPULATION_DROP');
}

export function cinemaDateKind(originalDate:string|null,runDate:string|null):CinemaListing['dateKind'] {
  if(!originalDate||!runDate)return 'unknown';
  // Large delays may also be a first local release. Do not call these a new
  // world premiere or send first-release alerts. The UI says "Cinema run".
  return Date.parse(runDate)-Date.parse(originalDate)>365*86400000?'reissue':'initial';
}
