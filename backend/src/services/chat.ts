import type { ChatBlock } from "../domain/types.js";
import { FixtureTmdbRepository, type TmdbRepository } from "../repositories/tmdb-repository.js";
import { UserRepository } from "../repositories/user-repository.js";
import { rankCandidates } from "./recommendation.js";
import {titleKey} from "./recommendation.js";
import { isPersistentPreference, fallbackIntent } from "./intent.js";
import { AiService } from "./ai.js";
import { EpgService } from "./epg/service.js";
import { generateCandidates } from "./candidates.js";
import { tvWindow } from "./tv-window.js";
import { explicitCountry,countryTimezones } from "./country-context.js";
import {ChatActions} from './chat-actions.js';
import {addSuitabilityCaution} from "./composition-intro.js";
import {chatCapabilityReply} from './chat-help.js';
import {requestedTvScope,tvFollowup,tvContextSchema,tvReferenceMatches} from './chat-tv.js';

export class ChatService {
  constructor(
    private readonly users = new UserRepository(),
    private readonly catalog: TmdbRepository = new FixtureTmdbRepository(),
    private readonly ai = new AiService(),
    private readonly epg = new EpgService(),
  ) {}

  async respond(userId: string, message: string, requestedSessionId?: string): Promise<{ sessionId: string; blocks: ChatBlock[] }> {
    const sessionId = requestedSessionId ?? await this.users.createConversation(userId);
    await this.users.addConversationMessage(userId, sessionId, "user", message);
    const help=chatCapabilityReply(message);
    if(help){const blocks:ChatBlock[]=[{type:'text',content:help}];await this.users.addConversationMessage(userId,sessionId,'assistant',help,blocks);return {sessionId,blocks};}
    const action = await new ChatActions(this.users,this.catalog,this.ai,this.epg).handle(userId,sessionId,message) ?? await this.tryPreference(userId,message);
    if (action) {
      const blocks: ChatBlock[] = action;
      await this.users.addConversationMessage(userId, sessionId, "assistant", blocks.filter(b=>b.type==='text'||b.type==='confirmation').map(b=>b.content).join('\n'), blocks);
      return { sessionId, blocks };
    }

    const storedState = await this.users.getRecommendationState(userId);
    const requestedCountry=explicitCountry(message);
    const state={...storedState,country:requestedCountry??storedState.country,timezone:requestedCountry?countryTimezones[requestedCountry]??storedState.timezone:storedState.timezone};
    const savedContext = await this.users.getSessionContext(userId,sessionId);
    const followup=tvFollowup(message);
    if(followup!==null){
      const context=tvContextSchema.safeParse(savedContext.tv);
      const references=context.success?context.data.programs.filter(p=>!followup||tvReferenceMatches(p.title,followup)):[];
      let intro='Which broadcast do you mean? Please give its channel and day, or ask for the schedule first.';
      let programs:Awaited<ReturnType<EpgService['listWindow']>>=[];
      if(context.success&&references.length===1&&(!requestedCountry||requestedCountry===context.data.country)){
        const result=await this.epg.nextBroadcast(references[0]!,context.data.country,userId);
        programs=result.programs;
        intro=result.stale?'That listing has changed or expired. Please check the channel’s schedule again.':programs.length?`After ${references[0]!.title} on ${programs[0]!.channel.name} · ${new Intl.DateTimeFormat('en-GB',{timeZone:context.data.timezone,dateStyle:'medium',timeStyle:'short'}).format(programs[0]!.startAt)} (${context.data.timezone})`:'No next listing is available for that channel in the following 48 hours. I haven’t substituted another channel.';
        await this.users.setSessionContext(userId,sessionId,{...savedContext,tv:programs.length?{...context.data,programs:programs.map(p=>({id:p.id,title:p.title,startAt:p.startAt.toISOString()}))}:undefined});
      }
      const blocks:ChatBlock[]=[{type:'text',content:intro},...(programs.length?[{type:'tv_carousel' as const,items:programs}]:[])];
      const id=await this.users.addConversationMessage(userId,sessionId,'assistant',intro,blocks);
      await this.users.saveDisplayedReferences(userId,sessionId,id,programs.map(p=>({contentType:'liveEvent' as const,externalId:p.id,metadata:{title:p.title,channel:p.channel.name,startsAt:p.startAt.toISOString()}})));
      return {sessionId,blocks};
    }
    const mightBeTv=/\b(tv|television|channel|broadcast|on|pe|canal)\b|\b(?:at|la)\s*\d/i.test(message);
    const scope=mightBeTv?requestedTvScope(message,await this.epg.chatChannels(state.country),state.timezone):null;
    if(scope){
      // A new TV question replaces the old anchor even when it cannot be resolved.
      await this.users.setSessionContext(userId,sessionId,{...savedContext,tv:undefined,filter:undefined});
      if('error'in scope){const blocks:ChatBlock[]=[{type:'text',content:scope.error}];await this.users.addConversationMessage(userId,sessionId,'assistant',scope.error,blocks);return {sessionId,blocks};}
      const pages=await Promise.all((scope.channelIds.length?scope.channelIds:[undefined]).map(channelId=>this.epg.listWindow(scope.start,scope.end,state.country,userId,channelId?{channelId}:{})));
      const unique=new Map(pages.flat().map(p=>[`${p.title}:${+p.startAt}:${p.channel.name.replace(/\s+(?:HD|SD)$/i,'')}`,p]));
      const programs=[...unique.values()].sort((a,b)=>+a.startAt-+b.startAt).slice(0,12);
      await this.users.setSessionContext(userId,sessionId,{...savedContext,filter:undefined,tv:{country:state.country,timezone:state.timezone,programs:programs.map(p=>({id:p.id,title:p.title,startAt:p.startAt.toISOString()}))}});
      const intro=programs.length?`${scope.channelName??'TV'} · ${scope.label} · ${state.country}`:`No listing found for ${scope.channelName??'TV'} · ${scope.label} in ${state.country}. I haven’t substituted another channel or time.`;
      const blocks:ChatBlock[]=[{type:'text',content:intro},...(programs.length?[{type:'tv_carousel' as const,items:programs}]:[])];
      const id=await this.users.addConversationMessage(userId,sessionId,'assistant',intro,blocks);
      await this.users.saveDisplayedReferences(userId,sessionId,id,programs.map(p=>({contentType:'liveEvent' as const,externalId:p.id,metadata:{title:p.title,channel:p.channel.name,startsAt:p.startAt.toISOString()}})));
      return {sessionId,blocks};
    }
    const previous = savedContext.country && savedContext.country!==state.country ? undefined : savedContext.filter as import("../domain/types.js").FilterQuery | undefined;
    const query = await this.ai.parseIntent(message,previous).catch(() => undefined);
    const safeQuery = query ?? fallbackIntent(message,previous);
    // 'Tonight' alone is temporal context, not a request to switch from streaming to EPG.
    const broadcastMessage=message.replace(/\blive[- ]action\b/gi,"");
    if (!/\b(tv|television|broadcast|channel|live)\b/i.test(broadcastMessage) && !previous?.tvWindow) safeQuery.tvWindow=null;
    if (/\b(tv|television|broadcast|channel)\b/i.test(message)) {
      if (/\btomorrow\b/i.test(message)) safeQuery.tvWindow="tomorrow";
      else if (/\blive|right now\b/i.test(message)) safeQuery.tvWindow="live";
      else if (/\btonight\b/i.test(message)) safeQuery.tvWindow="tonight";
    }
    await this.users.setSessionContext(userId,sessionId,{filter:safeQuery,country:state.country});
    if (safeQuery.tvWindow || /\b(tv|television|live)\b/i.test(broadcastMessage)) {
      const window=tvWindow(safeQuery.tvWindow,state.timezone);
      const programs = (await this.epg.listWindow(window.start,window.end,state.country,userId)).filter(p=>safeQuery.tvWindow!=="tomorrow"||p.startAt>=window.start).slice(0,12);
      const intro = programs.length ? `Here’s the ${safeQuery.tvWindow ?? "upcoming"} TV schedule for ${state.country}.` : "I couldn’t find TV entries in the requested EPG window.";
      const blocks: ChatBlock[] = programs.length
        ? [{ type: "text", content: intro }, { type: "tv_carousel", items: programs }, { type: "quick_actions", actions: ["Only movies", "Starting in the next hour", "Something on streaming"] }]
        : [{ type: "empty_state", title: "No TV schedule available", message: "Streaming discovery is still available." }];
      const assistantId = await this.users.addConversationMessage(userId, sessionId, "assistant", intro, blocks);
      await this.users.saveDisplayedReferences(userId, sessionId, assistantId, programs.map((program) => ({ contentType: "liveEvent" as const, externalId: program.id, metadata: { title: program.title, channel:program.channel.name, startsAt: program.startAt.toISOString() } })));
      return { sessionId, blocks };
    }
    const candidates = safeQuery.intent === "TITLE_LOOKUP" || safeQuery.intent === "AVAILABILITY_LOOKUP"
      ? await this.catalog.search({ query: safeQuery.query, region: state.country })
      : await generateCandidates(this.catalog,state,safeQuery);
    const reviewConcepts=safeQuery.intent==="DISCOVERY"&&(safeQuery.keywords.length>0||safeQuery.moods.length>0||safeQuery.excludedMoods.length>0);
    const ranked = rankCandidates(candidates, safeQuery, { ...state, viewerIds: [userId], temporaryMoods: safeQuery.moods }, reviewConcepts?12:8);
    const composed = await this.ai.compose(message, ranked,reviewConcepts,safeQuery).catch(() => ({ intro: ranked.length ? "These are catalog-based candidates; I couldn't verify the more nuanced story fit just now." : "I couldn't find a strong match for that yet.", quickActions: ["Try something lighter", "Under 90 minutes"],selectedKeys:undefined }));
    const delivered=(composed.selectedKeys?ranked.filter(r=>composed.selectedKeys!.includes(titleKey(r.item))):ranked).slice(0,8);
    await this.users.recordRecommendations(userId,delivered,sessionId);
    const selected = delivered.map((entry) => entry.item);
    composed.intro=addSuitabilityCaution(composed.intro,message,selected.length>0);
    const blocks: ChatBlock[] = [
      { type: "text", content: composed.intro },
      ...(selected.length ? [{ type: "movie_carousel" as const, items: selected }] : [{ type: "empty_state" as const, title: "No grounded matches", message: "Try loosening a provider or runtime constraint." }]),
      { type: "quick_actions", actions: composed.quickActions },
    ];
    const assistantId = await this.users.addConversationMessage(userId, sessionId, "assistant", composed.intro, blocks);
    await this.users.saveDisplayedItems(userId, sessionId, assistantId, selected);
    return { sessionId, blocks };
  }

  private async tryPreference(userId:string,message:string):Promise<ChatBlock[]|null> {
    if(/\b(?:do not|don['’]t|never)\s+(?:\w+\s+){0,4}(?:save|change|update|remember|add|mark|rate)\b/i.test(message))return null;
    if(!isPersistentPreference(message))return null;
    const extracted=await this.ai.extractTaste(message,[]).catch(()=>({signals:[]}));
    if(!extracted.signals.length)return [{type:"text",content:"I couldn’t extract a clear lasting preference. Nothing changed; you can edit Your Taste."}];
    await this.users.upsertTaste(userId,extracted.signals.map(s=>({...s,source:"chat_explicit"})));
    const labels=(positive:boolean)=>extracted.signals.filter(s=>positive?s.score>0:s.score<0).map(s=>{
      if(s.dimension==='language'){try{return `${new Intl.DisplayNames(['en'],{type:'language'}).of(s.key)}-language titles`;}catch{return s.key;}}
      if(s.dimension==='country'){try{return `titles from ${new Intl.DisplayNames(['en'],{type:'region'}).of(s.key.toUpperCase())}`;}catch{return s.key;}}
      return s.key;
    });
    const liked=labels(true),disliked=labels(false);
    return [{type:"confirmation",content:`I’ve saved your taste preferences.${liked.length?` More of: ${liked.join(', ')}.`:''}${disliked.length?` Less of: ${disliked.join(', ')}.`:''} You can review or correct them in Your Taste.`}];
  }
}
