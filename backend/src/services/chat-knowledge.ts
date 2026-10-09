import {entitySchema,displayedEntity,resolveEntity,refersBack,type Entity} from '../domain/entities.js';
import type {ChatBlock} from '../domain/types.js';
import type {UserRepository} from '../repositories/user-repository.js';
import type {TmdbRepository} from '../repositories/tmdb-repository.js';
import type {AiService} from './ai.js';
import type {EpgService} from './epg/service.js';
import {normalizeSearch} from './search-ranking.js';

export const isKnowledgeQuestion=(s:string)=>/\b(who (?:plays|played|is|was|directed|wrote)|what else|tell me (?:more|about)|what(?: is|['’]s) .+ about|where (?:was|is) .+ filmed|based on a true story|cancelled|canceled|another season|renewed|announced|confirmed|when is .+ (?:on|airing)|when will .+ air|what episode|how many (?:seasons|episodes))\b/i.test(s);
const text=(content:string):ChatBlock[]=>[{type:'text',content}];

export class ChatKnowledge {
 constructor(private users:UserRepository,private catalog:TmdbRepository,private ai:AiService,private epg:EpgService){}
 async handle(userId:string,sessionId:string,message:string):Promise<ChatBlock[]|null>{
  if(!isKnowledgeQuestion(message))return null;
  const context=await this.users.getSessionContext(userId,sessionId);
  const displayed=(await this.users.recentDisplayedItems(userId,sessionId)).map(displayedEntity).filter((e):e is Entity=>e!==null);
  const focus=entitySchema.safeParse(context.focus);
  const ordinal=/\b(first|second|third|fourth|fifth|last)\b/i.test(message);
  const named=displayed.filter(e=>e.title.length>2&&(` ${normalizeSearch(message)} `).includes(` ${normalizeSearch(e.title)} `));
  let entity=ordinal?resolveEntity(message,displayed):named.length===1?named[0]!:resolveEntity(message,focus.success?[focus.data]:displayed);
  if(!entity&&focus.success&&['series','episode'].includes(focus.data.type)&&/^(?:who (?:directed|wrote)|tell me about) (?:season \d+ )?episode \d+[?. ]*$/i.test(message))entity=focus.data;
  if(refersBack(message)&&!entity)return text('Which one do you mean? Tell me the title or its position in the last set of cards.');
  const {profile}=await this.users.getSettings(userId);
  let season:number|null=null,episode:number|null=null;
  if(!entity){
   const subject=await this.ai.knowledgeSubject(message);
   if(!subject?.query)return text('Which movie, series or person would you like to know about?');
   season=subject.season;episode=subject.episode;
   if(subject.type==='person'){
    const people=await this.catalog.people?.(subject.query)??[];
    const exact=people.filter(p=>normalizeSearch(p.name)===normalizeSearch(subject.query));
    if(exact.length!==1)return text('I found more than one possible identity, or no exact match. Can you give their full name and one film or series they appeared in?');
    entity={type:'person',source:'tmdb',id:String(exact[0]!.id),tmdbId:exact[0]!.id,title:exact[0]!.name};
   }else{
    const found=await this.catalog.search({query:subject.query,region:profile.country,summaryOnly:true});
    const exact=found.filter(p=>(subject.type==='unknown'||subject.type===p.mediaType)&&(subject.year===null||p.year===subject.year)&&[p.title,p.originalTitle].some(t=>t&&normalizeSearch(t)===normalizeSearch(subject.query)));
    if(exact.length!==1)return text(`Please specify the movie or series and year.${exact.length?' Possible matches: '+exact.slice(0,5).map(p=>`${p.title} (${p.year??'year unknown'}, ${p.mediaType})`).join('; '):''}`);
    const item=exact[0]!;entity={type:item.mediaType,source:'tmdb',id:String(item.id),tmdbId:item.id,title:item.title};
   }
  }
  await this.users.setSessionContext(userId,sessionId,{...context,focus:entity});
  if(entity.type!=='person'&&/\b(?:this|that) (?:actor|actress|person|director)\b/i.test(message))return text('Which person or character do you mean? A movie or programme can have several people associated with it.');
  if(entity.type==='broadcast'){
   const broadcast=await this.epg.broadcastDetails(entity.id,entity.country??profile.country);
   if(!broadcast)return text('That listing has expired or changed. Please check the guide again.');
   if(!entity.tmdbId||!entity.matchedMediaType)return [await this.ai.answerKnowledge(message,{entity,broadcast},false)];
   entity={...entity,id:String(entity.tmdbId),type:entity.matchedMediaType,source:'tmdb'};
  }
  if(entity.type==='episode'){season=entity.season??null;episode=entity.episode??null;entity={...entity,type:'series',id:String(entity.seriesId),tmdbId:entity.seriesId};}
  season=Number(message.match(/\bseason\s+(\d+)\b/i)?.[1])||season||entity.season||null;
  episode=Number(message.match(/\bepisode\s+(\d+)\b/i)?.[1])||episode;
  if(episode!==null&&season===null)return text('Which season is that episode from?');
  if(entity.type!=='movie'&&entity.type!=='series'&&entity.type!=='person')return text('I don’t have enough verified detail for that reference yet. Please name its series or title.');
  if(/when is .+ (?:on|airing)|when will .+ air/i.test(message)&&entity.type!=='person'){
   const item=await this.catalog.getTitle(entity.type,Number(entity.id),profile.country);
   const airings=item?await this.epg.broadcastsForTitle(item,profile.country):[];
   return text(airings.length?airings.slice(0,5).map(p=>`${p.title} — ${p.channel.name}, ${new Intl.DateTimeFormat('en-GB',{timeZone:profile.timezone,dateStyle:'medium',timeStyle:'short'}).format(p.startAt)}`).join('\n'):'No verified upcoming broadcast appears in your country’s available guide. That does not mean it won’t air.');
  }
  const facts=entity.type==='series'&&season!==null&&episode!==null
    ?await this.catalog.episodeKnowledge?.(Number(entity.id),season,episode)
    :await this.catalog.knowledge?.(entity.type,Number(entity.id));
  if(entity.type==='series'&&season!==null)await this.users.setSessionContext(userId,sessionId,{...context,focus:episode!==null?{...entity,type:'episode',id:String(facts?.id??`${entity.id}:${season}:${episode}`),seriesId:Number(entity.id),season,episode}:{...entity,season}});
  const seasonFacts=entity.type==='series'&&season!==null?await this.catalog.season?.(Number(entity.id),season):undefined;
  const web=/cancelled|canceled|announced|confirmed|renewed|another season|filmed|true story|latest|news|why\b/i.test(message)||!facts;
  const answer=await this.ai.answerKnowledge(message,{entity,...facts,...(seasonFacts?{season,episodes:episode===null?seasonFacts.episodes:seasonFacts.episodes.filter(e=>e.number===episode)}:{})},web);
  // Carry an actor/director forward only when a single verified credit is named
  // in the answer. Never manufacture identities from model memory.
  if(entity.type!=='person'&&facts&&'content'in answer&&/who (?:plays|played|directed|wrote)/i.test(message)){
   const credits=[...(Array.isArray(facts.cast)?facts.cast:[]),...(Array.isArray(facts.crew)?facts.crew:[])] as Array<{id?:number;name?:string}>;
   const named=[...new Map(credits.filter(p=>p.id&&p.name&&normalizeSearch(answer.content).includes(normalizeSearch(p.name))).map(p=>[p.id,p])).values()];
   if(named.length===1){const p=named[0]!;await this.users.setSessionContext(userId,sessionId,{...context,focus:{type:'person',source:'tmdb',id:String(p.id),tmdbId:p.id,title:p.name}});}
  }
  return [answer];
 }
}
