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
import {ChatKnowledge} from './chat-knowledge.js';
import {broadcastReference} from '../domain/entities.js';
import {personalizationFor} from './personalization.js';
import {isExplicitKeywordExclusion} from './preference-exclusions.js';
import {resolveTasteExamples} from './taste-examples.js';

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
    // A normal taste declaration should not pay for an action-parser call first.
    const preferenceFirst=isPersistentPreference(message)&&! /\b(add|remove|mark|rate|watchlist|seen|remind|confirm|cancel)\b/i.test(message);
    const action = (preferenceFirst?await this.tryPreference(userId,message):null) ?? await new ChatActions(this.users,this.catalog,this.ai,this.epg).handle(userId,sessionId,message) ?? (preferenceFirst?null:await this.tryPreference(userId,message));
    if (action) {
      const blocks: ChatBlock[] = action;
      const id=await this.users.addConversationMessage(userId, sessionId, "assistant", blocks.filter(b=>b.type==='text'||b.type==='confirmation').map(b=>b.content).join('\n'), blocks);
      const cards=blocks.flatMap(b=>b.type==='library_changes'||b.type==='movie_carousel'?b.items.map(item=>({id:item.id,mediaType:item.mediaType,title:item.title,year:item.year})):[]);
      if(cards.length)await this.users.saveDisplayedReferences(userId,sessionId,id,cards.map(item=>({contentType:item.mediaType,externalId:String(item.id),metadata:{title:item.title,year:item.year,source:'tmdb',tmdbId:item.id}})));
      return { sessionId, blocks };
    }
    const knowledge=await new ChatKnowledge(this.users,this.catalog,this.ai,this.epg).handle(userId,sessionId,message).catch(()=>[{type:'text' as const,content:'I couldn’t verify that answer just now. Please try again.'}]);
    if(knowledge){await this.users.addConversationMessage(userId,sessionId,'assistant',knowledge.map(b=>'content'in b?b.content:'').join('\n'),knowledge);return {sessionId,blocks:knowledge};}

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
        intro=result.stale?'That listing has changed or expired. Please check the channel’s schedule again.':programs.length?`After ${references[0]!.title} on ${programs[0]!.channel.name} · ${new Intl.DateTimeFormat('en-GB',{timeZone:context.data.timezone,dateStyle:'medium',timeStyle:'short'}).format(programs[0]!.startAt)}`:'No next listing is available for that channel in the following 48 hours. I haven’t substituted another channel.';
        await this.users.setSessionContext(userId,sessionId,{...savedContext,tv:programs.length?{...context.data,programs:programs.map(p=>({id:p.id,title:p.title,startAt:p.startAt.toISOString()}))}:undefined});
      }
      const blocks:ChatBlock[]=[{type:'text',content:intro},...(programs.length?[{type:'tv_carousel' as const,items:programs}]:[])];
      const id=await this.users.addConversationMessage(userId,sessionId,'assistant',intro,blocks);
      await this.users.saveDisplayedReferences(userId,sessionId,id,programs.map(p=>broadcastReference(p,context.success?context.data.country:state.country)));
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
      const intro=programs.length?`${scope.channelName??'TV'} — ${scope.label.replace(/ \([^)]*\)/g,'')}`:`No listing found for ${scope.channelName??'TV'} at that time. I haven’t substituted another channel or time.`;
      const blocks:ChatBlock[]=[{type:'text',content:intro},...(programs.length?[{type:'tv_carousel' as const,items:programs}]:[])];
      const id=await this.users.addConversationMessage(userId,sessionId,'assistant',intro,blocks);
      await this.users.saveDisplayedReferences(userId,sessionId,id,programs.map(p=>broadcastReference(p,state.country)));
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
    await this.users.setSessionContext(userId,sessionId,{...savedContext,filter:safeQuery,country:state.country});
    if (safeQuery.tvWindow || /\b(tv|television|live)\b/i.test(broadcastMessage)) {
      const window=tvWindow(safeQuery.tvWindow,state.timezone);
      const programs = (await this.epg.listWindow(window.start,window.end,state.country,userId)).filter(p=>safeQuery.tvWindow!=="tomorrow"||p.startAt>=window.start).slice(0,12);
      const intro = programs.length ? `Here’s the ${safeQuery.tvWindow ?? "upcoming"} TV schedule for ${state.country}.` : "I couldn’t find TV entries in the requested EPG window.";
      const blocks: ChatBlock[] = programs.length
        ? [{ type: "text", content: intro }, { type: "tv_carousel", items: programs }, { type: "quick_actions", actions: ["Only movies", "Starting in the next hour", "Something on streaming"] }]
        : [{ type: "empty_state", title: "No TV schedule available", message: "Streaming discovery is still available." }];
      const assistantId = await this.users.addConversationMessage(userId, sessionId, "assistant", intro, blocks);
      await this.users.saveDisplayedReferences(userId, sessionId, assistantId, programs.map(p=>broadcastReference(p,state.country)));
      return { sessionId, blocks };
    }
    const candidates = safeQuery.intent === "TITLE_LOOKUP" || safeQuery.intent === "AVAILABILITY_LOOKUP"
      ? await this.catalog.search({ query: safeQuery.query, region: state.country })
      : await generateCandidates(this.catalog,state,safeQuery);
    const reviewConcepts=safeQuery.intent==="DISCOVERY"&&(safeQuery.keywords.length>0||safeQuery.moods.length>0||safeQuery.excludedMoods.length>0);
    const personal=await personalizationFor(this.users,this.catalog).prepare(candidates,state,userId,safeQuery);
    const ranked = rankCandidates(candidates, safeQuery, { ...state,...personal, viewerIds: [userId], temporaryMoods: safeQuery.moods }, reviewConcepts?12:8);
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
    if(!isPersistentPreference(message))return null;
    if(/\b(?:do not|don['’]t|never)\s+(?:(?:ever|automatically|permanently|also)\s+)?(?:save|change|update|remember|add|mark|rate)\b/i.test(message))return [{type:'text',content:'I haven’t changed your saved Taste.'}];
    if(/\b(this|that) (kind|type|sort)\b/i.test(message))return [{type:'text',content:'What part wasn’t for you—the story, tone, pacing, or something else? I won’t treat one movie as a dislike of its whole genre.'}];
    const result=await this.ai.extractTaste(message,[]).catch(()=>({signals:[]}));
    const requests='examples'in result?result.examples??[]:[];
    const examples=requests.length?await resolveTasteExamples(this.catalog,requests,message,(await this.users.getSettings(userId)).profile.country):{items:[],signals:[],issues:[]};
    if(examples.issues.length)return [{type:'text',content:`${examples.issues.join(' ')} Nothing changed yet. Please repeat the examples with those details.`}];
    const extracted={signals:result.signals.filter(s=>s.confidence>=.75 && (s.dimension!=='combination'||(s.conditions?.length??0)>=2))};
    extracted.signals.push(...examples.signals);
    if(!extracted.signals.length)return [{type:"text",content:"I couldn’t extract a clear lasting preference. Nothing changed; you can edit Your Taste."}];
    await this.users.upsertTaste(userId,extracted.signals.map(s=>({...s,source:"chat_explicit"})));
    const labels=(positive:boolean)=>extracted.signals.filter(s=>positive?s.score>0:s.score<0).map(s=>{
      if(s.dimension==='language'){try{return `${new Intl.DisplayNames(['en'],{type:'language'}).of(s.key)}-language titles`;}catch{return s.key;}}
      if(s.dimension==='country'){try{return `titles from ${new Intl.DisplayNames(['en'],{type:'region'}).of(s.key.toUpperCase())}`;}catch{return s.key;}}
      return s.key;
    });
    const liked=labels(true),disliked=labels(false);
    const excluded=extracted.signals.filter(s=>isExplicitKeywordExclusion({...s,source:'chat_explicit'})).map(s=>s.key);
    return [{type:"confirmation",content:`I’ve saved your taste preferences.${liked.length?` More of: ${liked.join(', ')}.`:''}${disliked.length?` Less of: ${disliked.join(', ')}.`:''}${excluded.length?` I’ll exclude titles tagged ${excluded.join(', ')} from recommendations.`:''} You can review or correct them in Your Taste.${examples.items.length?' I used their catalog descriptions as story examples, without changing your ratings or Seen list. Tell me which parts matter most to refine this.':''}`},...(examples.items.length?[{type:'movie_carousel' as const,items:examples.items}]:[])];
  }
}
