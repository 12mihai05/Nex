import type { ChatBlock,ContentItem } from "../domain/types.js";
import { FixtureTmdbRepository, type TmdbRepository } from "../repositories/tmdb-repository.js";
import { UserRepository } from "../repositories/user-repository.js";
import { rankCandidates } from "./recommendation.js";
import {titleKey} from "./recommendation.js";
import { isPersistentPreference, fallbackIntent } from "./intent.js";
import { AiService,type ChatIntentContext } from "./ai.js";
import {normalizeSearch} from './search-ranking.js';
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
import {isExplicitExclusion} from './preference-exclusions.js';
import {resolveTasteExamples} from './taste-examples.js';
import {cleanChatBlocks,cleanChatCopy} from '../domain/chat-copy.js';
import type {ChatIntent} from './chat-intent.js';
import {ChatTvGuide} from './chat-tv-guide.js';
import {ChatPersonal} from './chat-personal.js';
import {ChatReleases} from './chat-releases.js';
import {ChatExplain} from './chat-explain.js';
import {ChatTasteEdit} from './chat-taste-edit.js';
import {taskPlanSchema,chatTaskInstructions} from './chat-capability-plans.js';
import type {ChatRoute} from './chat-routing.js';
const tasteReply=(message:string)=>/^(?:yes|no|yep|nope|correct|exactly|do that|please do|keep them|allow them|exclude them|cancel|never mind)\b/i.test(message.trim());

export class ChatService {
  constructor(
    private readonly users = new UserRepository(),
    private readonly catalog: TmdbRepository = new FixtureTmdbRepository(),
    private readonly ai = new AiService(),
    private readonly epg = new EpgService(),
    private readonly experiment:{parallelReads?:boolean;combinedPlanner?:boolean}={},
  ) {}

  async respond(userId: string, message: string, requestedSessionId?: string): Promise<{ sessionId: string; blocks: ChatBlock[] }> {
    const result=await this.respondInternal(userId,message,requestedSessionId);
    return {...result,blocks:cleanChatBlocks(result.blocks)};
  }

  private async respondInternal(userId: string, message: string, requestedSessionId?: string,forcedRoute?:ChatRoute['route']): Promise<{ sessionId: string; blocks: ChatBlock[] }> {
    const sessionId = requestedSessionId ?? await this.users.createConversation(userId);
    if(!forcedRoute)await this.users.addConversationMessage(userId, sessionId, "user", message);
    // These are application-generated confirmation commands, not natural-
    // language intent. They are quota-exempt and must never trigger an LLM call.
    const protocolCommand=/^(confirm|cancel) changes(?: [a-f0-9-]{36})?$/i.test(message);
    let route:Awaited<ReturnType<AiService['routeChat']>>=forcedRoute?{route:forcedRoute,reply:''}:protocolCommand?{route:'action',reply:''}:null;
    let history:Array<{role:string;content:string}>|undefined=forcedRoute?await this.users.recentConversationMessages(userId,sessionId):undefined;
    let plannedFilter:ChatIntent|undefined;
    if(protocolCommand){
      const context=await this.users.getSessionContext(userId,sessionId),id=message.match(/[a-f0-9-]{36}$/i)?.[0];
      if(id&&[(context.tasteEditPlan as {id?:string}|undefined)?.id,(context.tasteEditReceipt as {id?:string}|undefined)?.id].includes(id)){
        const blocks=await this.users.commitTasteEdit(userId,sessionId,id,/^cancel/i.test(message)).catch(()=>[{type:'text' as const,content:'That Taste preview expired or your preferences changed since it was created. Please request the correction again; no new change was applied.'}]);
        await this.users.addConversationMessage(userId,sessionId,'assistant',blocks.map(b=>'content'in b?b.content:'').join('\n'),blocks);return {sessionId,blocks};
      }
    }
    // Production decisions come from the model with recent context. Rules below
    // remain only as a no-key fixture fallback and data/action safety checks.
    if(this.ai.mode==='live'&&!protocolCommand&&!forcedRoute){
      const [recent,context,routeDisplayed]=await Promise.all([this.users.recentConversationMessages(userId,sessionId),this.users.getSessionContext(userId,sessionId),this.experiment.combinedPlanner?this.users.recentDisplayedItems(userId,sessionId):Promise.resolve([])]);
      history=recent;
      try{
        if(this.experiment.combinedPlanner){const plan=await this.ai.planChat(message,recent,{history:recent,focus:context.focus,personalRead:context.personalRead,releaseBrowse:context.releaseBrowse,tasteEditPending:!!context.tasteEditPlan,tastePending:context.tastePending,tv:context.tv,displayed:routeDisplayed,...(context.filter?{filter:context.filter as Partial<import('../domain/types.js').FilterQuery>}:{})});route=plan;plannedFilter=plan.filter??undefined;}
        else route=await this.ai.routeChat(message,recent,{tastePending:context.tastePending,personalRead:context.personalRead,releaseBrowse:context.releaseBrowse,tasteEditPending:!!context.tasteEditPlan,focus:context.focus,tv:context.tv,filter:context.filter});
      }
      catch{const content='I couldn’t read your message properly just now. Nothing changed. Please try again.';await this.users.addConversationMessage(userId,sessionId,'assistant',content,[{type:'text',content}]);return {sessionId,blocks:[{type:'text',content}]};}
      if(route?.route==='conversation'||route?.route==='out_of_scope'){
        const content=route.reply||'Would you like to talk about a film, a series, or something in Nex?';
        await this.users.addConversationMessage(userId,sessionId,'assistant',content,[{type:'text',content}]);
        return {sessionId,blocks:[{type:'text',content}]};
      }
    }
    if(route?.route==='compound'){
      const context=await this.users.getSessionContext(userId,sessionId);
      const plan=await this.ai.structured(taskPlanSchema,'chat_tasks',chatTaskInstructions,{message,history,context:{focus:context.focus,tv:context.tv,filter:context.filter,releaseBrowse:context.releaseBrowse,personalRead:context.personalRead}}).catch(()=>null);
      const write=(r:string)=>['action','preference','taste_edit'].includes(r);
      if(!plan||!plan.tasks.length||plan.unhandled.length||plan.tasks.filter(t=>write(t.route)).length>1||plan.tasks.some((t,i)=>t.dependsOn!==null&&t.dependsOn>=i||write(t.route)&&!message.includes(t.request))){
        const content='I couldn’t safely separate all the parts of that request. Please send them as smaller requests so none gets missed and each change can be checked. Nothing changed.';
        await this.users.addConversationMessage(userId,sessionId,'assistant',content,[{type:'text',content}]);return {sessionId,blocks:[{type:'text',content}]};
      }
      const blocks:ChatBlock[]=[],resolved:boolean[]=[];
      for(const task of plan.tasks){
        if(task.dependsOn!==null&&!resolved[task.dependsOn]){const block:ChatBlock={type:'text',content:`I couldn’t continue this part without a verified result: ${task.request}. Please clarify the title or programme first.`};blocks.push(block);await this.users.addConversationMessage(userId,sessionId,'assistant',block.content,[block]);resolved.push(false);continue;}
        const before=await this.users.getSessionContext(userId,sessionId);
        try{
          const result=await this.respondInternal(userId,task.request,sessionId,task.route);blocks.push(...result.blocks);
          const after=await this.users.getSessionContext(userId,sessionId);
          resolved.push(result.blocks.some(b=>(b.type==='movie_carousel'||b.type==='tv_carousel')&&b.items.length>0)||Boolean(after.focus&&(result.blocks.some(b=>b.type==='knowledge')||JSON.stringify(after.focus)!==JSON.stringify(before.focus))));
        }catch{const content=`I couldn’t complete this part just now: ${task.request}. Other completed parts are shown above; check any saved changes before retrying.`;blocks.push({type:'text',content});await this.users.addConversationMessage(userId,sessionId,'assistant',content,[{type:'text',content}]);resolved.push(false);}
      }
      return {sessionId,blocks};
    }
    if(route&&['releases','explain','taste_edit'].includes(route.route)){
      let blocks:ChatBlock[];
      try{blocks=route.route==='releases'?await new ChatReleases(this.users,this.catalog,this.ai).handle(userId,sessionId,message):route.route==='explain'?await new ChatExplain(this.users,this.ai,this.catalog).handle(userId,sessionId,message):await new ChatTasteEdit(this.users,this.ai).handle(userId,sessionId,message);}
      catch{blocks=[{type:'text',content:route.route==='taste_edit'?'I couldn’t prepare that Taste correction. Nothing changed. You can retry or edit it in Profile > Your Taste.':'I couldn’t retrieve that information just now. Please retry; missing information is not confirmation that a release or recommendation does not exist.'}];}
      const id=await this.users.addConversationMessage(userId,sessionId,'assistant',blocks.map(b=>'content'in b?b.content:'').join('\n'),blocks);
      for(const b of blocks)if(b.type==='movie_carousel'&&b.items.length)await this.users.saveDisplayedItems(userId,sessionId,id,b.items);
      return {sessionId,blocks};
    }
    if(route?.route==='personal'){
      const content=await new ChatPersonal(this.users,this.ai,this.epg,this.catalog).answer(userId,sessionId,message).catch(()=>'I couldn’t read your saved profile just now. Nothing changed. Please try again.');
      const blocks:ChatBlock[]=[{type:'text',content}];await this.users.addConversationMessage(userId,sessionId,'assistant',content,blocks);return {sessionId,blocks};
    }
    if(route?.route==='tv'){
      try{return {sessionId,blocks:await new ChatTvGuide(this.users,this.catalog,this.ai,this.epg).handle(userId,sessionId,message)};}
      catch{const content='I couldn’t verify the TV guide just now. Please try again.';await this.users.addConversationMessage(userId,sessionId,'assistant',content,[{type:'text',content}]);return {sessionId,blocks:[{type:'text',content}]};}
    }
    const help=route||isPersistentPreference(message)?null:chatCapabilityReply(message);
    if(help){const blocks:ChatBlock[]=[{type:'text',content:help}];await this.users.addConversationMessage(userId,sessionId,'assistant',help,blocks);return {sessionId,blocks};}
    // A normal taste declaration should not pay for an action-parser call first.
    const preferenceFirst=(isPersistentPreference(message)&&! /\b(mark|rate|watchlist|seen|remind|confirm|cancel)\b/i.test(message))||tasteReply(message);
    const action = route
      ? route.route==='preference'?await this.tryPreference(userId,sessionId,message,history):route.route==='action'?await new ChatActions(this.users,this.catalog,this.ai,this.epg).handle(userId,sessionId,message,true)??[{type:'text' as const,content:'What would you like to change? Nothing changed yet.'}]:null
      : (preferenceFirst?await this.tryPreference(userId,sessionId,message):null) ?? await new ChatActions(this.users,this.catalog,this.ai,this.epg).handle(userId,sessionId,message) ?? (preferenceFirst?null:await this.tryPreference(userId,sessionId,message));
    if (action) {
      const blocks: ChatBlock[] = action;
      const id=await this.users.addConversationMessage(userId, sessionId, "assistant", blocks.filter(b=>b.type==='text'||b.type==='confirmation').map(b=>b.content).join('\n'), blocks);
      const cards=blocks.flatMap(b=>b.type==='library_changes'||b.type==='movie_carousel'?b.items.map(item=>({id:item.id,mediaType:item.mediaType,title:item.title,year:item.year})):[]);
      if(cards.length)await this.users.saveDisplayedReferences(userId,sessionId,id,cards.map(item=>({contentType:item.mediaType,externalId:String(item.id),metadata:{title:item.title,year:item.year,source:'tmdb',tmdbId:item.id}})));
      return { sessionId, blocks };
    }
    const knowledge=(!route||route.route==='knowledge')?await new ChatKnowledge(this.users,this.catalog,this.ai,this.epg).handle(userId,sessionId,message,route?.route==='knowledge').catch(()=>[{type:'text' as const,content:'I couldn’t verify that answer just now. Please try again.'}]):null;
    if(knowledge){await this.users.addConversationMessage(userId,sessionId,'assistant',knowledge.map(b=>'content'in b?b.content:'').join('\n'),knowledge);return {sessionId,blocks:knowledge};}

    const [storedState,savedContext,displayed,shown]=this.experiment.parallelReads!==false
      ? await Promise.all([this.users.getRecommendationState(userId),this.users.getSessionContext(userId,sessionId),this.users.recentDisplayedItems(userId,sessionId),this.users.sessionRecommendationKeys(userId,sessionId)])
      : [await this.users.getRecommendationState(userId),await this.users.getSessionContext(userId,sessionId),await this.users.recentDisplayedItems(userId,sessionId),await this.users.sessionRecommendationKeys(userId,sessionId)] as const;
    const requestedCountry=explicitCountry(message);
    const state={...storedState,country:requestedCountry??storedState.country,timezone:requestedCountry?countryTimezones[requestedCountry]??storedState.timezone:storedState.timezone};
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
    const mightBeTv=!route&&/\b(tv|television|channel|broadcast|on|pe|canal)\b|\b(?:at|la)\s*\d/i.test(message);
    const scope=mightBeTv?requestedTvScope(message,await this.epg.chatChannels(state.country),state.timezone):null;
    if(scope){
      // A new TV question replaces the old anchor even when it cannot be resolved.
      await this.users.setSessionContext(userId,sessionId,{...savedContext,tv:undefined,filter:undefined});
      if('error'in scope){const blocks:ChatBlock[]=[{type:'text',content:scope.error}];await this.users.addConversationMessage(userId,sessionId,'assistant',scope.error,blocks);return {sessionId,blocks};}
      const pages=await Promise.all((scope.channelIds.length?scope.channelIds:[undefined]).map(channelId=>this.epg.listWindow(scope.start,scope.end,state.country,userId,channelId?{channelId}:{})));
      const unique=new Map(pages.flat().map(p=>[`${p.title}:${+p.startAt}:${p.channel.name.replace(/\s+(?:HD|SD)$/i,'')}`,p]));
      const programs=[...unique.values()].sort((a,b)=>+a.startAt-+b.startAt).slice(0,12);
      await this.users.setSessionContext(userId,sessionId,{...savedContext,filter:undefined,tv:{country:state.country,timezone:state.timezone,programs:programs.map(p=>({id:p.id,title:p.title,startAt:p.startAt.toISOString()}))}});
      const intro=programs.length?`On ${scope.channelName??'TV'}, ${scope.label.replace(/ \([^)]*\)/g,'')}:`:`I couldn’t find a listing for ${scope.channelName??'that channel'} at that time.`;
      const blocks:ChatBlock[]=[{type:'text',content:intro},...(programs.length?[{type:'tv_carousel' as const,items:programs}]:[])];
      const id=await this.users.addConversationMessage(userId,sessionId,'assistant',intro,blocks);
      await this.users.saveDisplayedReferences(userId,sessionId,id,programs.map(p=>broadcastReference(p,state.country)));
      return {sessionId,blocks};
    }
    const previous = savedContext.country && savedContext.country!==state.country ? undefined : savedContext.filter as import("../domain/types.js").FilterQuery | undefined;
    const intentContext:ChatIntentContext={history:history??await this.users.recentConversationMessages(userId,sessionId),focus:savedContext.focus,displayed};
    const query = plannedFilter??await this.ai.parseIntent(message,previous,intentContext).catch(() => undefined);
    if(query?.clarification||(!query&&this.ai.mode==='live')){
      const content=query?.clarification||'I couldn’t interpret that request just now. Please try again.';
      const blocks:ChatBlock[]=[{type:'text',content}];
      await this.users.addConversationMessage(userId,sessionId,'assistant',content,blocks);
      return {sessionId,blocks};
    }
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
    let referenceTitle:ContentItem|undefined;
    if(safeQuery.intent==='DISCOVERY'&&safeQuery.similarTo){
      const matches=(await this.catalog.search({query:safeQuery.similarTo,region:state.country})).filter(i=>[i.title,i.originalTitle].some(t=>t&&normalizeSearch(t)===normalizeSearch(safeQuery.similarTo!)));
      const focus=savedContext.focus as {tmdbId?:number;type?:string}|undefined;
      referenceTitle=matches.length===1?matches[0]:matches.find(i=>i.id===focus?.tmdbId&&i.mediaType===focus?.type);
      if(!referenceTitle){const content='Which movie or series do you mean? Please include its year so I can match the right one.';const blocks:ChatBlock[]=[{type:'text',content}];await this.users.addConversationMessage(userId,sessionId,'assistant',content,blocks);return {sessionId,blocks};}
      intentContext.referenceTitle={title:referenceTitle.title,overview:referenceTitle.overview.slice(0,1000),keywords:referenceTitle.keywords.slice(0,40),genres:referenceTitle.genres};
    }
    const newRecommendations=safeQuery.intent==='DISCOVERY'&&query?.recommendationMode!=='repeat';
    const pool = safeQuery.intent === "TITLE_LOOKUP" || safeQuery.intent === "AVAILABILITY_LOOKUP"
      ? await this.catalog.search({ query: safeQuery.query, region: state.country })
      : await generateCandidates(this.catalog,state,safeQuery,referenceTitle,newRecommendations&&shown.size?Math.min(500,1+Math.ceil(shown.size/8)):1);
    const candidates=newRecommendations?pool.filter(i=>!shown.has(titleKey(i))):pool;
    const reviewConcepts=safeQuery.intent==="DISCOVERY"&&(!!safeQuery.similarTo||safeQuery.keywords.length>0||safeQuery.moods.length>0||safeQuery.excludedMoods.length>0);
    const personal=await personalizationFor(this.users,this.catalog).prepare(candidates,state,userId,safeQuery);
    const ranked = rankCandidates(candidates, safeQuery, { ...state,...personal, viewerIds: [userId], temporaryMoods: safeQuery.moods }, safeQuery.similarTo?32:reviewConcepts?12:8);
    const composed = await this.ai.compose(message, ranked,reviewConcepts,safeQuery,intentContext).catch(() => ({ intro: "I couldn’t verify a good match for that request just now. Please try again.", quickActions: [],selectedKeys:reviewConcepts?[] as string[]:undefined }));
    const chosen=composed.selectedKeys?ranked.filter(r=>composed.selectedKeys!.includes(titleKey(r.item))):ranked;
    if(safeQuery.similarTo&&composed.selectedKeys)chosen.sort((a,b)=>composed.selectedKeys!.indexOf(titleKey(a.item))-composed.selectedKeys!.indexOf(titleKey(b.item)));
    const delivered=chosen.slice(0,8);
    await this.users.recordRecommendations(userId,delivered,sessionId);
    const selected = delivered.map((entry) => entry.item);
    composed.intro=addSuitabilityCaution(composed.intro,message,selected.length>0);
    const blocks: ChatBlock[] = [
      { type: "text", content: composed.intro },
      ...(selected.length ? [{ type: "movie_carousel" as const, items: selected }] : [{ type: "empty_state" as const, title: "No grounded matches", message: newRecommendations&&shown.size?"I couldn’t verify more matches without repeating earlier suggestions. Try another service or loosen one constraint.":"Try loosening a provider or runtime constraint." }]),
      { type: "quick_actions", actions: composed.quickActions },
    ];
    const assistantId = await this.users.addConversationMessage(userId, sessionId, "assistant", composed.intro, blocks);
    await this.users.saveDisplayedItems(userId, sessionId, assistantId, selected);
    return { sessionId, blocks };
  }

  private async tryPreference(userId:string,sessionId:string,message:string,conversation?:Array<{role:string;content:string}>):Promise<ChatBlock[]|null> {
    const persistent=isPersistentPreference(message);
    if(!conversation&&!persistent&&!tasteReply(message))return null;
    let description=message,userEvidence=message;
    let context:Record<string,unknown>|undefined;
    const referring=/\b(?:based on|what i (?:told|said)|above|earlier|previous|as discussed)\b/i.test(message);
    if(conversation||!persistent||referring){
      context=await this.users.getSessionContext(userId,sessionId);
      const pending=context.tastePending as {request?:string;question?:string;at?:number}|undefined;
      const history=conversation??await this.users.recentConversationMessages(userId,sessionId);
      const previous=history.slice(0,-1).at(-1);
      if(pending?.request&&pending.question&&pending.at&&Date.now()-pending.at<30*60_000&&previous?.role==='assistant'&&previous.content===cleanChatCopy(pending.question)){
        if(/^(?:cancel|never mind)\b/i.test(message)){await this.users.setSessionContext(userId,sessionId,{...context,tastePending:undefined});return [{type:'text',content:'Okay, I haven’t changed your Taste.'}];}
        userEvidence=`${pending.request}\n${message}`;
        description=`User request: ${pending.request}\nAssistant clarification: ${pending.question}\nUser answer: ${message}`;
      }else if(conversation||persistent&&referring){
        userEvidence=history.filter(h=>h.role==='user').map(h=>h.content).join('\n');
        description=`Recent conversation (untrusted context):\n${JSON.stringify(history)}\nCurrent request: ${message}`;
      }else return null;
    }
    if(/\b(?:do not|don['’]t|never)\s+(?:(?:ever|automatically|permanently|also)\s+)?(?:save|change|update|remember|add|mark|rate)\b/i.test(message))return [{type:'text',content:'I haven’t changed your saved Taste.'}];
    if(/\b(this|that) (kind|type|sort)\b/i.test(message))return [{type:'text',content:'What part wasn’t for you: the story, tone, pacing, or something else? I won’t assume you dislike the whole genre.'}];
    const result=await this.ai.extractTaste(description,[],userEvidence,true).catch(()=>null);
    if(!result)return [{type:'text',content:'I couldn’t save that preference just now. Nothing changed. Please try your reply again.'}];
    if('clarification'in result&&result.clarification){
      context??=await this.users.getSessionContext(userId,sessionId);
      const question=`${result.clarification}\n\nNothing changed yet.`;
      await this.users.setSessionContext(userId,sessionId,{...context,tastePending:{request:userEvidence.slice(0,6000),question,at:Date.now()}});
      return [{type:'text',content:question}];
    }
    const requests='examples'in result?result.examples??[]:[];
    const examples=requests.length?await resolveTasteExamples(this.catalog,requests,userEvidence,(await this.users.getSettings(userId)).profile.country):{items:[],signals:[],issues:[]};
    if(examples.issues.length)return [{type:'text',content:`${examples.issues.join(' ')} Nothing changed yet. Please repeat the examples with those details.`}];
    const extracted={signals:result.signals.filter(s=>s.confidence>=.75 && (s.dimension!=='combination'||(s.conditions?.length??0)>=2))};
    extracted.signals.push(...examples.signals);
    if(!extracted.signals.length)return [{type:"text",content:context?.tastePending?'I couldn’t safely apply that answer to your preference. Nothing changed. Please restate the preference with the exception you want to keep.':"I’m not sure what you’d like me to remember. Nothing changed. What should I look for, or avoid, in future recommendations?"}];
    const existing=extracted.signals.some(s=>s.dimension==='combination'&&s.statement)?await this.users.getTaste(userId):[];
    // Repeating the same sourced statement should update its scope, not create
    // duplicates merely because the model reworded the human-readable label.
    const evidenceKey=(s:string)=>s.trim().toLowerCase().replace(/\s+/g,' ');
    await this.users.upsertTaste(userId,extracted.signals.map(s=>{
      const prior=s.dimension==='combination'&&s.statement?existing.find(e=>e.dimension===s.dimension&&e.statement&&evidenceKey(e.statement)===evidenceKey(s.statement!)):undefined;
      return {...s,key:prior?.key??s.key,source:"chat_explicit"};
    }));
    if(context)await this.users.setSessionContext(userId,sessionId,{...context,tastePending:undefined});
    const label=(s:typeof extracted.signals[number])=>{
      if(s.dimension==='language'){try{return `${new Intl.DisplayNames(['en'],{type:'language'}).of(s.key)}-language titles`;}catch{return s.key;}}
      if(s.dimension==='country'){try{return `titles from ${new Intl.DisplayNames(['en'],{type:'region'}).of(s.key.toUpperCase())}`;}catch{return s.key;}}
      return s.key;
    };
    const hardExcluded=(s:typeof extracted.signals[number])=>isExplicitExclusion({...s,source:'chat_explicit'});
    const liked=extracted.signals.filter(s=>s.score>0).map(label);
    const disliked=extracted.signals.filter(s=>s.score<0&&!hardExcluded(s)).map(label);
    const excluded=extracted.signals.filter(hardExcluded).map(label);
    const coProductions=extracted.signals.some(s=>s.conditions?.some(c=>c.dimension==='country'&&c.match==='only'));
    return [{type:"confirmation",content:`Got it. I’ve updated your Taste.${liked.length?`\n\nI’ll look for more ${liked.join(', ')}.`:''}${disliked.length?`\n\nI’ll give less weight to ${disliked.join(', ')}.`:''}${excluded.length?`\n\nI’ll exclude ${excluded.join(', ')} where the catalog identifies them.`:''}${coProductions?' Co-productions with countries outside that group stay eligible.':''}${examples.items.length?'\n\nI used these stories as examples, without changing your ratings or Seen list.':''}`},...(examples.items.length?[{type:'movie_carousel' as const,items:examples.items}]:[])];
  }
}
