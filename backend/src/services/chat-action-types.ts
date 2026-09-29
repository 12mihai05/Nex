import {z} from 'zod';
import type {ContentItem} from '../domain/types.js';

export const titleChangeSchema=z.object({
  sourceText:z.string().max(400),title:z.string().max(300),year:z.number().int().nullable(),
  tmdbId:z.number().int().positive().nullable(),
  mediaType:z.enum(['movie','series','any']),position:z.number().int().min(1).max(12).nullable(),
  watchlist:z.enum(['keep','add','remove']),seen:z.enum(['keep','seen','unseen']),
  rating:z.enum(['keep','clear','like','super_like','dislike','meh']),
});
export const chatActionIntentSchema=z.object({
  kind:z.enum(['none','library','reminder']),
  entries:z.array(titleChangeSchema).max(50),
  requestedCount:z.number().int().min(0),
  unresolved:z.array(z.string().max(400)).max(50),
  reminder:z.object({title:z.string().max(300),channel:z.string().max(150),
    date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),localTime:z.string().regex(/^\d{2}:\d{2}$/).nullable(),
    offsetMinutes:z.number().int().min(0).max(1440),country:z.string().regex(/^[A-Z]{2}$/).nullable(),
    position:z.number().int().min(1).max(12).nullable(),
  }).nullable(),
});
export type TitleChange=z.infer<typeof titleChangeSchema>;
export type ChatActionIntent=z.infer<typeof chatActionIntentSchema>;
export interface ChatActionPlan {
  id:string;expiresAt:number;country:string;timezone:string;
  entries:Array<{item:ContentItem;change:TitleChange}>;
  reminder?:{id:string;title:string;channelName:string;startAt:string;offsetMinutes:number};
  summary:string;
}
export function looksLikeAction(message:string){
  const plain=message.normalize('NFKD').replace(/[\u0300-\u036f]/g,'');
  return /\b(add|put|save|mark|rate|remove|unmark|clear|watchlist|remind|reminder|seen|watched|liked|disliked|super.?like|meh|adauga|pune|marcheaza|vazut|vazute|vazuta|aminteste|reaminteste|notifica|sterge)\b|\b(?:i|please)\s+(?:like|dislike|hate)\b/i.test(plain);
}
