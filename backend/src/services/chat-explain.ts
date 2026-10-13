import type {UserRepository} from '../repositories/user-repository.js';
import type {AiService} from './ai.js';
import type {ChatBlock} from '../domain/types.js';
import {displayedEntity,entitySchema,type Entity} from '../domain/entities.js';
import {chatReference} from './chat-reference.js';
import type {TmdbRepository} from '../repositories/tmdb-repository.js';
import {normalizeSearch} from './search-ranking.js';
export class ChatExplain {
 constructor(private users:UserRepository,private ai:AiService,private catalog?:TmdbRepository){}
 async handle(userId:string,sessionId:string,message:string):Promise<ChatBlock[]>{
  const [context,displayed,history]=await Promise.all([this.users.getSessionContext(userId,sessionId),this.users.recentDisplayedItems(userId,sessionId),this.users.recentConversationMessages(userId,sessionId)]);
  const focus=entitySchema.safeParse(context.focus);
  const entities=displayed.map(displayedEntity).filter((e):e is Entity=>!!e);
  let {entity,choices}=await chatReference(this.ai,message,entities.length?entities:focus.success?[focus.data]:[],history);
  if(!entity&&this.catalog){
   const subject=await this.ai.knowledgeSubject(message);
   if(subject?.query&&subject.type!=='person'){
    const {profile}=await this.users.getSettings(userId);
    const matches=(await this.catalog.search({query:subject.query,region:profile.country,summaryOnly:true})).filter(i=>(subject.type==='unknown'||subject.type===i.mediaType)&&(!subject.year||subject.year===i.year)&&[i.title,i.originalTitle].some(t=>t&&normalizeSearch(t)===normalizeSearch(subject.query)));
    if(matches.length===1){const item=matches[0]!;entity={type:item.mediaType,id:String(item.id),tmdbId:item.id,title:item.title,source:'tmdb'};choices=[];}
   }
  }
  if(!entity||!['movie','series'].includes(entity.type))return [{type:'text',content:'Which recommended film or series do you mean? You can name it or refer to its position in the cards.'},...(choices.length?[{type:'quick_actions' as const,actions:choices.map(t=>`Why did you recommend ${t}?`)}]:[])];
  const evidence=await this.users.recommendationEvidence(userId,entity.type,Number(entity.id),sessionId);
  if(!evidence)return [{type:'text',content:`I don’t have a recorded recommendation reason for ${entity.title}. It may have appeared in search or release listings rather than as a personalised pick. I won’t invent a reason.`}];
  const useful=evidence.filter(e=>e.weight>.1&&!e.code.startsWith('quality:')&&!e.code.startsWith('tentative:')).sort((a,b)=>b.weight-a.weight).slice(0,3);
  return [{type:'text',content:useful.length?`${entity.title} was selected using these recorded matches: ${useful.map(e=>e.label).join('; ')}. These explain that recommendation, not a guarantee you’ll enjoy it.`:`${entity.title} was a discovery pick without strong recorded personal evidence. I don’t have enough evidence to claim it closely matches your Taste.`}];
 }
}
