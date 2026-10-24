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
import {historyForTask} from './chat-capability-plans.js';
import {tvPlanSchema,type TvPlan} from './tv-plan.js';

export class ChatTvGuide {
  constructor(private users:UserRepository,private catalog:TmdbRepository,private ai:AiService,private epg:EpgService){}
  async handle(userId:string,sessionId:string,message:string,persistReply=true,planned?:TvPlan):Promise<ChatBlock[]>{
    const [state,context,history]=await Promise.all([this.users.getRecommendationState(userId),this.users.getSessionContext(userId,sessionId),this.users.recentConversationMessages(userId,sessionId)]);
    let country=explicitCountry(message)??state.country,timezone=country!==state.country?countryTimezones[country]??state.timezone:state.timezone;
    const priorCountry=(context.tv as {country?:string}|undefined)?.country;
    const countries=[...new Set([country,...(priorCountry&&priorCountry in countryTimezones?[priorCountry]:[])])];
    let channels=(await Promise.all(countries.map(async code=>(await this.epg.chatChannels(code)).map(c=>({...c,country:code}))))).flat();
    const now=new Date();
    const localDate=(date:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
    const reply=async(content:string,programs:TvListing[]=[]):Promise<ChatBlock[]>=>{
      const blocks:ChatBlock[]=[{type:'text',content},...(programs.length?[{type:'tv_carousel' as const,items:programs}]:[])];
      if(persistReply){const id=await this.users.addConversationMessage(userId,sessionId,'assistant',content,blocks);
      if(programs.length)await this.users.saveDisplayedReferences(userId,sessionId,id,programs.map(p=>broadcastReference(p,country)));}
      return blocks;
    };
    const plan=planned?tvPlanSchema.parse(planned):await this.ai.planTv(message,historyForTask(history,message),context,channels,{country,profileCountry:state.country,date:localDate(now),timezone,nowResolution:'The server resolves now to the exact current instant. Do not convert now to HH:mm; time must be null unless the user requested a particular clock time.'});
    if(plan.clarification)return reply(plan.clarification);
    if(plan.country){
      if(!(plan.country in countryTimezones))return reply('Which supported country should I check for TV listings?');
      country=plan.country;timezone=country===state.country?state.timezone:countryTimezones[country]!;
      if(!countries.includes(country))channels=(await this.epg.chatChannels(country)).map(c=>({...c,country}));
    }
    channels=channels.filter(c=>c.country===country);
    if(plan.channelIds.some(id=>!channels.some(c=>c.id===id)))return reply('I couldn’t identify that channel in your TV guide. Please use its name from the guide.');
    if(plan.mode==='channel_overview'||plan.mode==='channel_summary'){
      if(plan.channelIds.length!==1)return reply('Which channel would you like to know about? Please give its name.');
      const channel=channels.find(c=>c.id===plan.channelIds[0])!;
      const entries=(await this.epg.listWindow(new Date(+now-7*86400000),new Date(+now+14*86400000),country,userId,{channelId:channel.id,limit:5000})).filter(p=>!isOffAir(p.title));
      const counts=new Map<string,{title:string;category:string|null;description:string|null;broadcasts:number}>();
      for(const p of entries){const key=normalizeSearch(p.title),old=counts.get(key);counts.set(key,{title:p.title,category:p.category,description:p.description?.slice(0,400)??null,broadcasts:(old?.broadcasts??0)+1});}
      const answer=await this.ai.answerKnowledge(message,{channel,country,observedPrograms:entries.length,uniquePrograms:counts.size,examples:[...counts.values()].sort((a,b)=>b.broadcasts-a.broadcasts).slice(0,20),
        limits:'This is a limited retained schedule sample, not an all-time channel profile. Repeats are counts, not quality ratings. No listings means unknown programming. For channel identity use the official broadcaster website and cite it; do not confuse a channel with a programme or an HD/PPV sibling.'},plan.mode==='channel_overview');
      await this.users.setSessionContext(userId,sessionId,{...context,focus:{type:'channel',source:'epg',id:channel.id,title:channel.name,country},tv:{country,timezone,channelIds:[channel.id],goal:plan.goal,programs:[]}});
      if(persistReply)await this.users.addConversationMessage(userId,sessionId,'assistant','content'in answer?answer.content:'',[answer]);return [answer];
    }
    const requestedWindow=()=>{
      if(plan.horizonHours&&!plan.date&&!plan.time)return {start:now,end:new Date(+now+plan.horizonHours*3600000)};
      let window=plan.date?localDayWindow(plan.date,timezone):tvWindow(plan.window,timezone,now);
      if(plan.time){
        if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(plan.time))throw new Error('INVALID_TV_CLOCK');
        const [h,m]=plan.time.split(':').map(Number),start=localClockTime(plan.date??localDate(window.start),h!,m!,timezone);
        window={start,end:new Date(+start+1)};
      }
      return window;
    };
    const previous=context.tv as {window?:{start:string;end:string};delivered?:string[];deliveredTitles?:string[];country?:string}|undefined;
    const more=plan.pagination==='more'&&previous?.country===country;
    const window=more&&previous.window?{start:new Date(previous.window.start),end:new Date(previous.window.end)}:requestedWindow();
    const delivered=new Set(more?previous?.delivered??[]:[]);
    const deliveredTitles=new Set(more?previous?.deliveredTitles??[]:[]);
    if(+window.end<=+now-86400000||+window.start>+now+14*86400000)return reply('That date is outside the available TV guide. I can check the upcoming two weeks where listings exist.');
    let programs:TvListing[]=[],intro:string;
    if(plan.mode==='title_airings'){
      if(!plan.title)return reply('Which movie or series would you like me to check?');
      const recent=context.tv as {country?:string;programs?:Array<{title:string;year?:number|null}>}|undefined;
      const matching=recent?.country===country?recent.programs?.filter(p=>normalizeSearch(p.title)===normalizeSearch(plan.title!))??[]:[];
      const years=new Set(matching.map(p=>p.year));
      // A follow-up to a displayed broadcast can reuse its supplied year. Do
      // not infer from another country, missing years or conflicting remakes.
      const contextualYear=matching.length&&years.size===1&&typeof matching[0]!.year==='number'?matching[0]!.year:null;
      const year=plan.year??contextualYear;
      const found=(await this.catalog.search({query:plan.title,region:country,summaryOnly:true})).filter(i=>(!year||i.year===year)&&[i.title,i.originalTitle].some(t=>t&&normalizeSearch(t)===normalizeSearch(plan.title!)));
      if(found.length!==1)return reply('Which movie or series do you mean? Please include its year so I can check the right one.');
      const item=found[0]!;
      programs=(await this.epg.broadcastsForTitle(item,country,now)).filter(p=>!delivered.has(p.id)&&(!(plan.date||plan.time||plan.horizonHours||plan.window!=='live')||p.startAt<window.end&&p.endAt>window.start)).slice(0,12).map(p=>({...p,favorite:false,channel:{...p.channel,logoUrl:null}}));
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
      const rows=[...new Map(pages.flat().map(p=>[p.id,p])).values()].filter(p=>!delivered.has(p.id));
      if(plan.mode==='recommend'||!plan.channelIds.length){
        const shortlist=shortlistTv(rows.filter(p=>p.endAt>now&&!deliveredTitles.has(normalizeSearch(p.title))),state.taste);
        if(!shortlist.length)return reply('I couldn’t find watchable programmes in that time window. Off-air entries are not recommendations.');
        const result=await this.ai.selectTv(message,plan.goal,shortlist,state.taste,timezone);
        const allowed=new Map(shortlist.map(p=>[p.id,p]));
        if(result.ids.some(id=>!allowed.has(id)))return reply('I couldn’t verify those TV selections. Please try again.');
        programs=[...new Set(result.ids)].map(id=>allowed.get(id)!).filter(p=>{const key=normalizeSearch(p.title);if(deliveredTitles.has(key))return false;deliveredTitles.add(key);return true;});intro=result.intro;
      }else{
        programs=rows.sort((a,b)=>+a.startAt-+b.startAt).slice(0,12);
        intro=programs.length?programs.length===1&&isOffAir(programs[0]!.title)?`${programs[0]!.channel.name} is listed as off air during this time.`:`Here’s the schedule for ${[...new Set(programs.map(p=>p.channel.name))].join(', ')}.`:'No listing was supplied for that channel at the requested time.';
      }
    }
    await this.users.setSessionContext(userId,sessionId,{...context,tv:{country,timezone,goal:plan.goal,channelIds:plan.channelIds,window:{start:window.start.toISOString(),end:window.end.toISOString()},delivered:[...delivered,...programs.map(p=>p.id)],deliveredTitles:[...deliveredTitles],programs:programs.map(p=>({id:p.id,title:p.title,year:p.year,startAt:p.startAt.toISOString()}))},filter:undefined});
    return reply(intro,programs);
  }
}
