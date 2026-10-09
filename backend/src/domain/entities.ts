import {z} from 'zod';
import {normalizeSearch} from '../services/search-ranking.js';

/** Canonical context envelope, stored inside the existing expiring session context. */
export const entitySchema=z.object({
  type:z.enum(['movie','series','person','episode','channel','broadcast']),
  id:z.string().max(300),title:z.string().max(300),source:z.enum(['tmdb','epg']),
  tmdbId:z.number().int().positive().optional(),seriesId:z.number().int().positive().optional(),
  season:z.number().int().nonnegative().optional(),episode:z.number().int().positive().optional(),
  channelId:z.string().optional(),channelName:z.string().optional(),
  startsAt:z.string().optional(),endsAt:z.string().optional(),country:z.string().optional(),
  matchedMediaType:z.enum(['movie','series']).optional(),
});
export type Entity=z.infer<typeof entitySchema>;
export function broadcastReference(p:{id:string;title:string;startAt:Date;endAt:Date;channel:{id:string;name:string};matchedTmdbId?:number|null;matchedMediaType?:string|null;matchConfidence?:number|null},country:string){
 return {contentType:'liveEvent' as const,externalId:p.id,metadata:{entityType:'broadcast',source:'epg',title:p.title,channel:p.channel.name,channelName:p.channel.name,channelId:p.channel.id,startsAt:p.startAt.toISOString(),endsAt:p.endAt.toISOString(),country,
  ...((p.matchConfidence??0)>=.72&&p.matchedTmdbId?{tmdbId:p.matchedTmdbId,matchedMediaType:p.matchedMediaType}:{})}};
}
export const refersBack=(message:string)=>/\b(this|that|it|these|those|him|her|he|she|first|second|third|last)\b/i.test(message);
export function resolveEntity(message:string,entities:Entity[]):Entity|null {
  const words=normalizeSearch(message);
  const named=entities.filter(e=>e.title.length>2&&(` ${words} `).includes(` ${normalizeSearch(e.title)} `));
  if(named.length===1)return named[0]!;
  const index=words.match(/\b(first|second|third|fourth|fifth|last)\b/)?.[1];
  if(index){const n=index==='last'?entities.length-1:['first','second','third','fourth','fifth'].indexOf(index);return entities[n]??null;}
  return refersBack(message)&&entities.length===1?entities[0]!:null;
}
export function displayedEntity(row:{contentType:string;externalId:string;metadataJson:string|null}):Entity|null {
  try {
    const m=JSON.parse(row.metadataJson??'{}') as Record<string,unknown>;
    const parsed=entitySchema.safeParse({...m,type:row.contentType==='liveEvent'?'broadcast':row.contentType,id:row.externalId,
      source:row.contentType==='liveEvent'?'epg':'tmdb',...(row.contentType==='movie'||row.contentType==='series'?{tmdbId:Number(row.externalId)}:{})});
    return parsed.success?parsed.data:null;
  } catch {return null;}
}
