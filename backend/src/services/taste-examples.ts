import {z} from 'zod';
import type {ContentItem,TasteSignal} from '../domain/types.js';
import type {TmdbRepository} from '../repositories/tmdb-repository.js';

export const tasteExampleRequestSchema=z.object({
 title:z.string().min(1).max(200),year:z.number().int().min(1870).max(2200).nullable(),
 mediaType:z.enum(['movie','series']).nullable(),score:z.number().min(-1).max(1),
 director:z.string().max(160).nullable().describe('Only a director explicitly named by the user, otherwise null. Never infer one from knowledge.'),
 statement:z.string().min(3).max(600),
});
export type TasteExampleRequest=z.infer<typeof tasteExampleRequestSchema>;
const normalize=(value:string)=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();

// Resolve every example before saving anything. No popularity-based guessing between remakes.
export async function resolveTasteExamples(catalog:TmdbRepository,requests:TasteExampleRequest[],message:string,region:string) {
 const items:ContentItem[]=[],signals:TasteSignal[]=[],issues:string[]=[];
 if(requests.length>12)return {items,signals,issues:['Please split these examples into groups of at most 12 so I can verify each one.']};
 const results=[];
 for(let offset=0;offset<requests.length;offset+=4){
  results.push(...await Promise.all(requests.slice(offset,offset+4).map(async request=>{
   if(!message.toLowerCase().includes(request.statement.toLowerCase())||!normalize(request.statement).includes(normalize(request.title))||Math.abs(request.score)<.1)return {issue:`I couldn’t verify the preference for ${request.title}.`};
   try{
    const matches=(await catalog.search({query:request.title,region,summaryOnly:true})).filter(item=>
     [item.title,item.originalTitle??''].some(title=>normalize(title)===normalize(request.title))&&
     (request.year===null||item.year===request.year)&&(request.mediaType===null||item.mediaType===request.mediaType));
    let unique=[...new Map(matches.map(item=>[`${item.mediaType}:${item.id}`,item])).values()];
    if(request.director){
     if(!normalize(request.statement).includes(normalize(request.director)))return {issue:`Please explicitly name the director of ${request.title}.`};
     if(unique.length>6)return {issue:`Please include a release year for ${request.title} as well as its director.`};
     const detailed=await Promise.all(unique.map(item=>catalog.getTitle(item.mediaType,item.id,region)));
     unique=detailed.filter((item):item is ContentItem=>Boolean(item&&normalize(item.director??'')===normalize(request.director!)));
    }else if(unique.length>1&&unique.length<=6&&/\bdirected by\b/i.test(request.statement)){
     // Recover an omitted extraction field only from a verified director literally
     // supplied by the viewer, never from the model's knowledge or popularity.
     const detailed=await Promise.all(unique.map(item=>catalog.getTitle(item.mediaType,item.id,region)));
     const named=detailed.filter((item):item is ContentItem=>Boolean(item?.director&&normalize(request.statement).includes(`directed by ${normalize(item.director)}`)));
     if(named.length===1)unique=named;
    }
    if(unique.length!==1)return {issue:unique.length?`I found multiple versions of ${request.title}${request.year?` from ${request.year}`:''}. Please repeat the preference with its release year and director so I don’t guess.`:`I couldn’t identify ${request.title}. Please include its release year or original title.`};
    const match=unique[0]!;
    const item=await catalog.getTitle(match.mediaType,match.id,region);
    if(!item?.overview.trim())return {issue:`I couldn’t verify a description for ${request.title}.`};
    return {item,request};
   }catch{return {issue:`I couldn’t check ${request.title} right now. Please try again.`};}
  })));
 }
 for(const result of results){
  if(result.issue){issues.push(result.issue);continue;}
  if(!result.item||!result.request)continue;
  const {item,request}=result;
  const key=`stories like ${item.title}${item.year?` (${item.year})`:''}${item.mediaType==='series'?' — series':''}`;
  if(signals.some(s=>s.key===key))continue;
  items.push(item);
  signals.push({dimension:'story',key,score:Math.sign(request.score)*Math.min(.75,Math.abs(request.score)),confidence:.85,evidenceCount:1,source:'chat_explicit',statement:request.statement,
   meaning:item.overview.slice(0,400),example:{tmdbId:item.id,mediaType:item.mediaType,title:item.title},
  });
 }
 return {items,signals,issues};
}
