import type {UserRepository} from '../repositories/user-repository.js';
import type {TmdbRepository} from '../repositories/tmdb-repository.js';
import type {AiService} from './ai.js';
import type {EpgService} from './epg/service.js';
import type {ChatBlock} from '../domain/types.js';
import {broadcastReference} from '../domain/entities.js';
import {explicitCountry,countryTimezones} from './country-context.js';
import {tvWindow,localDayWindow,localClockTime} from './tv-window.js';
import {normalizeSearch} from './search-ranking.js';
import {isOffAir,shortlistTv,type TvListing} from './tv-selection.js';

export class ChatTvGuide {
  constructor(private users:UserRepository,private catalog:TmdbRepository,private ai:AiService,private epg:EpgService){}
  async handle(userId:string,sessionId:string,message:string):Promise<ChatBlock[]>{
    const [state,context,history]=await Promise.all([this.users.getRecommendationState(userId),this.users.getSessionContext(userId,sessionId),this.users.recentConversationMessages(userId,sessionId)]);
    const country=explicitCountry(message)??state.country,timezone=country!==state.country?countryTimezones[country]??state.timezone:state.timezone;
    const channels=await this.epg.chatChannels(country),now=new Date();
    const localDate=(date:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
    const reply=async(content:string,programs:TvListing[]=[]):Promise<ChatBlock[]>=>{
      const blocks:ChatBlock[]=[{type:'text',content},...(programs.length?[{type:'tv_carousel' as const,items:programs}]:[])];
      const id=await this.users.addConversationMessage(userId,sessionId,'assistant',content,blocks);
      if(programs.length)await this.users.saveDisplayedReferences(userId,sessionId,id,programs.map(p=>broadcastReference(p,country)));
      return blocks;
    };
    const plan=await this.ai.planTv(message,history,context,channels,{date:localDate(now),time:new Intl.DateTimeFormat('en-GB',{timeZone:timezone,timeStyle:'short'}).format(now)});
    if(plan.clarification)return reply(plan.clarification);
    if(plan.channelIds.some(id=>!channels.some(c=>c.id===id)))return reply('I couldn’t identify that channel in your TV guide. Please use its name from the guide.');
    const requestedWindow=()=>{
      let window=plan.date?localDayWindow(plan.date,timezone):tvWindow(plan.window,timezone,now);
      if(plan.time){
        if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(plan.time))throw new Error('INVALID_TV_CLOCK');
        const [h,m]=plan.time.split(':').map(Number),start=localClockTime(plan.date??localDate(window.start),h!,m!,timezone);
        window={start,end:new Date(+start+1)};
      }
      return window;
    };
    const window=requestedWindow();
    if(+window.end<=+now-86400000||+window.start>+now+14*86400000)return reply('That date is outside the available TV guide. I can check the upcoming two weeks where listings exist.');
    let programs:TvListing[]=[],intro:string;
    if(plan.mode==='title_airings'){
      if(!plan.title)return reply('Which movie or series would you like me to check?');
      const found=(await this.catalog.search({query:plan.title,region:country,summaryOnly:true})).filter(i=>(!plan.year||i.year===plan.year)&&[i.title,i.originalTitle].some(t=>t&&normalizeSearch(t)===normalizeSearch(plan.title!)));
      if(found.length!==1)return reply('Which movie or series do you mean? Please include its year so I can check the right one.');
      const item=found[0]!;
      programs=(await this.epg.broadcastsForTitle(item,country,now)).filter(p=>!(plan.date||plan.time||plan.window!=='live')||p.startAt<window.end&&p.endAt>window.start).slice(0,12).map(p=>({...p,favorite:false,channel:{...p.channel,logoUrl:null}}));
      intro=programs.length?`These are the scheduled broadcasts of ${item.title}.`:`I couldn’t find a verified upcoming TV broadcast of ${item.title} in the available guide. The guide does not cover every channel or future date, so that isn’t a guarantee it won’t air.`;
    }else if(plan.mode==='next'){
      const saved=context.tv as {country?:string;programs?:Array<{id:string;title:string;startAt:string}>}|undefined;
      let anchor=saved?.country===country?saved.programs?.find(p=>p.id===plan.anchorId):undefined;
      if(!anchor&&plan.channelIds.length===1){
        const point=plan.date||plan.time||plan.window==='tomorrow'?window.start:now;
        const live=await this.epg.listWindow(point,new Date(+point+1),country,userId,{channelId:plan.channelIds[0]!});
        if(live.length===1)anchor={id:live[0]!.id,title:live[0]!.title,startAt:live[0]!.startAt.toISOString()};
        else if(!live.length)programs=(await this.epg.listWindow(point,new Date(+point+48*3600000),country,userId,{channelId:plan.channelIds[0]!,futureOnly:true})).filter(p=>!isOffAir(p.title)).slice(0,1);
        else return reply('That channel has overlapping listings. Please name the programme you mean.');
      }
      if(anchor){
        const result=await this.epg.nextBroadcast(anchor,country,userId);
        if(result.stale)return reply('That listing has changed. Please ask for the channel’s current schedule again.');
        programs=result.programs;
        if(programs[0]&&isOffAir(programs[0].title))programs=(await this.epg.listWindow(programs[0].startAt,new Date(+programs[0].startAt+48*3600000),country,userId,{channelId:programs[0].channel.id})).filter(p=>!isOffAir(p.title)).slice(0,1);
      }else if(plan.channelIds.length!==1)return reply('Which channel or programme do you mean?');
      intro=programs.length?`Next on ${programs[0]!.channel.name}: ${programs[0]!.title}.`:'The available guide has no next programme for that channel within the checked 48-hour window. I haven’t substituted another channel.';
    }else{
      const pages=await Promise.all((plan.channelIds.length?plan.channelIds:[undefined]).map(channelId=>this.epg.listWindow(window.start,window.end,country,userId,{...(channelId?{channelId}:{}),limit:5000})));
      const rows=[...new Map(pages.flat().map(p=>[p.id,p])).values()];
      if(plan.mode==='recommend'||!plan.channelIds.length){
        const shortlist=shortlistTv(rows.filter(p=>p.endAt>now),state.taste);
        if(!shortlist.length)return reply('I couldn’t find watchable programmes in that time window. Off-air entries are not recommendations.');
        const result=await this.ai.selectTv(message,plan.goal,shortlist,state.taste,timezone);
        const allowed=new Map(shortlist.map(p=>[p.id,p]));
        if(result.ids.some(id=>!allowed.has(id)))return reply('I couldn’t verify those TV selections. Please try again.');
        programs=[...new Set(result.ids)].map(id=>allowed.get(id)!);intro=result.intro;
      }else{
        programs=rows.sort((a,b)=>+a.startAt-+b.startAt).slice(0,12);
        intro=programs.length?programs.length===1&&isOffAir(programs[0]!.title)?`${programs[0]!.channel.name} is listed as off air during this time.`:`Here’s the schedule for ${[...new Set(programs.map(p=>p.channel.name))].join(', ')}.`:'No listing was supplied for that channel at the requested time.';
      }
    }
    await this.users.setSessionContext(userId,sessionId,{...context,tv:{country,timezone,goal:plan.goal,channelIds:plan.channelIds,programs:programs.map(p=>({id:p.id,title:p.title,startAt:p.startAt.toISOString()}))},filter:undefined});
    return reply(intro,programs);
  }
}
