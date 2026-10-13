import type {UserRepository} from '../repositories/user-repository.js';
import type {AiService} from './ai.js';
import type {EpgService} from './epg/service.js';
import {normalizeSearch} from './search-ranking.js';
import type {TmdbRepository} from '../repositories/tmdb-repository.js';

export class ChatPersonal {
  constructor(private users:UserRepository,private ai:AiService,private epg:EpgService,private catalog:TmdbRepository){}
  async answer(userId:string,sessionId:string,message:string){
    const [context,history]=await Promise.all([this.users.getSessionContext(userId,sessionId),this.users.recentConversationMessages(userId,sessionId)]);
    const plan=await this.ai.planPersonal(message,history,context.personalRead);
    const facts:Record<string,unknown>={};
    const wanted=(scope:string)=>plan.scope===scope||plan.scope==='overview';
    const match=(text:string)=>!plan.query||normalizeSearch(text).includes(normalizeSearch(plan.query));
    const page=<T>(items:T[])=>({total:items.length,offset:plan.offset,items:items.slice(plan.offset,plan.offset+40),hasMore:items.length>plan.offset+40});
    if(wanted('taste')){
      const taste=await this.users.getTaste(userId);
      const matching=taste.filter(s=>match([s.key,s.meaning,s.statement].filter(Boolean).join(' '))).sort((a,b)=>Number(b.explicit??false)-Number(a.explicit??false)||Math.abs(b.score*b.confidence)-Math.abs(a.score*a.confidence));
      facts.taste={...page(matching),totalSaved:taste.length,query:plan.query,items:matching.slice(plan.offset,plan.offset+40).map(s=>({dimension:s.dimension,topic:s.key,meaning:s.meaning,opinion:s.score<0?'dislike':s.score>0?'like':'neutral',strength:Math.abs(s.score)>.7?'strong':'mild',confidence:s.confidence>.7?'high':'limited',explicit:s.explicit,excluded:s.exclude??false,conditions:s.conditions,source:s.source}))};
    }
    if(wanted('library')){
      const [watchlist,seen,ratings]=await Promise.all([this.users.listWatchlist(userId),this.users.listHistory(userId),this.users.listFeedback(userId)]);
      const names=new Map([...watchlist,...seen].map(p=>[`${p.mediaType}:${p.tmdbId}`,p.titleSnapshot]));
      const {profile}=await this.users.getSettings(userId);
      // Ratings do not imply Seen and therefore may have no history snapshot.
      // Resolve a named question once, or only the requested page of rating IDs.
      if(plan.query){
        const found=await this.catalog.search({query:plan.query,region:profile.country,summaryOnly:true});
        for(const item of found)if(match(item.title)||match(item.originalTitle??''))names.set(`${item.mediaType}:${item.id}`,item.title);
      }
      const selectedRatings=ratings.filter(p=>!plan.query||match(names.get(`${p.mediaType}:${p.tmdbId}`)??''));
      if(!plan.query&&(plan.library==='all'||plan.library==='ratings')){
        const pending=selectedRatings.slice(plan.offset,plan.offset+40).filter(p=>!names.has(`${p.mediaType}:${p.tmdbId}`));
        for(let i=0;i<pending.length;i+=4)await Promise.all(pending.slice(i,i+4).map(async p=>{
          const item=await this.catalog.getTitle(p.mediaType,p.tmdbId,profile.country).catch(()=>null);
          if(item)names.set(`${p.mediaType}:${p.tmdbId}`,item.title);
        }));
      }
      facts.library={query:plan.query,
        ...(plan.library==='all'||plan.library==='watchlist'?{watchlist:page(watchlist.filter(p=>match(p.titleSnapshot)).map(p=>({title:p.titleSnapshot,type:p.mediaType})))}:{}),
        ...(plan.library==='all'||plan.library==='seen'?{seen:page(seen.filter(p=>match(p.titleSnapshot)).map(p=>({title:p.titleSnapshot,type:p.mediaType})))}:{}),
        ...(plan.library==='all'||plan.library==='ratings'?{ratings:page(selectedRatings.map(p=>({title:names.get(`${p.mediaType}:${p.tmdbId}`)??null,type:p.mediaType,rating:p.reaction})))}:{}),
      };
    }
    if(wanted('reminders')){
      const {profile}=await this.users.getSettings(userId);
      const clock=new Intl.DateTimeFormat('en-GB',{timeZone:profile.timezone,dateStyle:'medium',timeStyle:'short'});
      facts.reminders=page((await this.users.listReminders(userId)).filter(r=>r.active&&r.startsAt>new Date()&&match(r.title)).map(r=>({title:r.title,channel:r.channelName,localStart:clock.format(r.startsAt),timezone:profile.timezone,minutesBefore:r.offsetMinutes})));
    }
    if(wanted('settings')){
      const {profile,services,languages}=await this.users.getSettings(userId);
      const favorites=[];for(let offset=0;;offset+=50){const chunk=await this.epg.listChannels(userId,profile.country,'',offset,true);favorites.push(...chunk);if(chunk.length<50)break;}
      facts.settings={country:profile.country,timezone:profile.timezone,services:services.map(s=>s.providerName),languages:languages.map(l=>({kind:l.kind,language:l.languageCode})),remindersEnabled:profile.remindersEnabled,behaviorPersonalization:profile.behaviorPersonalization,favouriteChannels:favorites.map(c=>({name:c.name,listingsAvailable:c.available}))};
    }
    await this.users.setSessionContext(userId,sessionId,{...context,personalRead:plan});
    return this.ai.explainPersonal(message,facts);
  }
}
