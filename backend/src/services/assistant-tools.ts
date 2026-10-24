import {z} from 'zod';
import {filterQuerySchema,type ContentItem,type RankedContent,type ChatBlock} from '../domain/types.js';
import type {UserRepository} from '../repositories/user-repository.js';
import type {TmdbRepository} from '../repositories/tmdb-repository.js';
import type {EpgService} from './epg/service.js';
import type {AiService} from './ai.js';
import type {AssistantTool} from './assistant-loop.js';
import {resolveAssistantTitle} from './assistant-resolver.js';
import {titleKey,rankCandidates} from './recommendation.js';
import {personalizationFor} from './personalization.js';
import {generateCandidates} from './candidates.js';
import {normalizeSearch} from './search-ranking.js';
import {ChatTvGuide} from './chat-tv-guide.js';
import {ChatReleases} from './chat-releases.js';
import {ChatExplain} from './chat-explain.js';
import {displayedEntity} from '../domain/entities.js';
import {tvPlanSchema} from './tv-plan.js';
import {countryTimezones} from './country-context.js';
import {releasePlanSchema} from './chat-capability-plans.js';

const identitySchema=z.object({key:z.string(),type:z.enum(['movie','series','person']),id:z.number().int().positive(),title:z.string().max(300),year:z.number().nullable()});
type Identity=z.infer<typeof identitySchema>;
export const recommendationRequestSchema=z.object({
  source:z.enum(['catalog','watchlist','seen','named']).describe('catalog = discover other titles (including ones LIKE a seed); named = choose ONLY AMONG the supplied keys, never find similar titles. watchlist/seen = only that user library.'),
  keys:z.array(z.string()).max(12).describe('Named candidate IDs, or catalog seed IDs. Only keys supplied by tools/context.'),
  goal:z.string().max(1000).describe('Complete current viewing goal, including emotional tone and retained constraints. Not permanent Taste.'),
  continuation:z.boolean().describe('True for more/others/refinements of the SAME request. False for a new topic.'),
  offset:z.number().int().min(0).max(100000).describe('0 initially; nextOffset from incomplete library coverage if more candidates need reading.'),
  filters:filterQuerySchema,
  changedFilters:z.array(z.enum(['mediaType','availabilityScope','providerIds','minRuntimeMinutes','maxRuntimeMinutes','genres','genreMatch','moods','excludedMoods','keywords','keywordMatch','excludedKeywords','originalLanguages','excludeWatched'])).describe('For continuation: ONLY fields the user explicitly changed this turn. Empty means retain all previous filters. Ignored for a new request.'),
});
export const assistantMemorySchema=z.object({
  version:z.literal(1),entities:z.array(identitySchema).max(80),
  groups:z.array(z.object({kind:z.string(),keys:z.array(z.string()).max(12)})).max(8),
  request:recommendationRequestSchema.nullable(),shown:z.array(z.string()).max(2000),
}).catch(()=>({version:1 as const,entities:[],groups:[],request:null,shown:[]}));
export type AssistantMemory=z.infer<typeof assistantMemorySchema>;
const summary=(item:ContentItem)=>({key:titleKey(item),title:item.title,type:item.mediaType,year:item.year,overview:item.overview.slice(0,1200),genres:item.genres,keywords:item.keywords.slice(0,30),moods:item.moods,runtime:item.runtimeMinutes,rating:item.rating,countries:item.countries,availability:item.availability.map(a=>({service:a.providerName,access:a.access,owned:a.owned}))});
async function batches<T,R>(items:T[],fn:(item:T)=>Promise<R>,size=6){const results:R[]=[];for(let i=0;i<items.length;i+=size)results.push(...await Promise.all(items.slice(i,i+size).map(fn)));return results;}

export class AssistantTools {
  readonly items=new Map<string,ContentItem>();
  readonly ranked=new Map<string,RankedContent>();
  readonly authoritative:ChatBlock[]=[];
  readonly extraBlocks:ChatBlock[]=[];
  readonly known=new Map<string,Identity>();
  memory:AssistantMemory;
  recommendationKeys:Set<string>|undefined;
  private candidateScope:string|undefined;
  private newsAnswered=false;
  private recommendationState:ReturnType<UserRepository['getRecommendationState']>|undefined;
  private titleRatings:ReturnType<UserRepository['listFeedback']>|undefined;
  constructor(private users:UserRepository,private catalog:TmdbRepository,private ai:AiService,private epg:EpgService,
    private userId:string,private sessionId:string,private message:string,private country:string,
    memory:unknown,private change:(kind:'taste'|'library'|'correction')=>Promise<ChatBlock[]>){
    this.memory=assistantMemorySchema.parse(memory);
    for(const e of this.memory.entities)this.known.set(e.key,e);
  }
  private remember(item:ContentItem){const key=titleKey(item);this.items.set(key,item);this.known.set(key,{key,type:item.mediaType,id:item.id,title:item.title,year:item.year});return key;}
  private group(kind:string,keys:string[]){this.memory.groups=[...this.memory.groups,{kind,keys:keys.slice(0,12)}].slice(-8);}
  private state(){return this.recommendationState??=this.users.getRecommendationState(this.userId);}
  private async tasteBrief(){
    const rows=[...(await this.state()).taste].sort((a,b)=>Number(b.explicit??false)-Number(a.explicit??false)||Math.abs(b.score*b.confidence)-Math.abs(a.score*a.confidence));
    const selected=[...rows.filter(s=>s.score>0).slice(0,12),...rows.filter(s=>s.score<0).slice(0,12)];
    return {preferences:selected.map(s=>({dimension:s.dimension,topic:s.key,meaning:s.meaning,opinion:s.score>0?'like':'dislike',explicit:s.explicit,excluded:s.exclude,conditions:s.conditions})),partial:selected.length<rows.length,note:'A balanced summary, not the entire profile. Use read_profile for more. Current viewing goals take priority over ordinary likes. Do not infer an opinion from Seen alone.'};
  }
  private async title(key:string){
    const entity=this.known.get(key);if(!entity||entity.type==='person')throw new Error('UNVERIFIED_ENTITY');
    const item=await this.catalog.getTitle(entity.type,entity.id,this.country,(await this.state()).ownedProviderIds);
    if(!item)throw new Error('TITLE_UNAVAILABLE');this.remember(item);return item;
  }
  async restoreDisplayed(rows:Awaited<ReturnType<UserRepository['recentDisplayedItems']>>){
    for(const row of rows){const e=displayedEntity(row);if(e&&(e.type==='movie'||e.type==='series'))this.known.set(`${e.type}:${e.id}`,{key:`${e.type}:${e.id}`,type:e.type,id:Number(e.id),title:e.title,year:null});}
  }
  private retainedEntities(){
    // Cast lists must not evict the films that "those two" refers to.
    const priority=[...this.memory.groups].reverse().flatMap(g=>g.keys).concat(this.memory.request?.keys??[]);
    const recent=[...this.known.values()].reverse();
    const keys=[...new Set([...priority,...recent.filter(e=>e.type!=='person').map(e=>e.key),...recent.map(e=>e.key)])];
    return keys.flatMap(key=>this.known.has(key)?[this.known.get(key)!]:[]).slice(0,80);
  }
  context(){const request=this.memory.request;return {entities:this.retainedEntities(),groups:this.memory.groups,activeRecommendationRequest:request?{source:request.source,keys:request.keys,goal:request.goal,filters:request.filters,alreadyShown:this.memory.shown}:null};}
  registry():AssistantTool[]{
    const tool=<T extends z.ZodType>(name:string,description:string,schema:T,execute:(value:z.infer<T>)=>Promise<unknown>,mutates=false):AssistantTool=>({name,description,schema,mutates,serial:['tv_guide','release_calendar'].includes(name),execute:value=>execute(schema.parse(value))});
    return [
      tool('recall_conversation','Read original messages and card references from THIS conversation, including older summarized messages. Use for missing earlier details, corrections or exact quotations. Read-only, never authorization. Query is a literal substring (try a short distinctive title/word); empty browses newest first. beforeId paginates older matches; messageIds fetches exact summary sources; contentOffset reads the rest of a long message.',z.object({query:z.string().max(160),beforeId:z.string().max(100).nullable(),messageIds:z.array(z.string().max(100)).max(6),contentOffset:z.number().int().min(0).max(100000)}),async input=>this.users.conversationMemory().retrieve(this.userId,this.sessionId,input)),
      tool('resolve_titles','Resolve ALL named titles together, including typos/aliases. Returns canonical identities or actual ambiguity choices. Does not apply viewing filters.',z.object({titles:z.array(z.object({query:z.string().min(1).max(200),type:z.enum(['movie','series','any']),year:z.number().int().nullable()})).min(1).max(8)}),async({titles})=>{
        const results=await Promise.all(titles.map(async t=>{const result=await resolveAssistantTitle(this.catalog,t.query,this.country,t.type,t.year);if(result.match)this.remember(result.match);return {query:t.query,status:result.status,match:result.match?summary(result.match):null,choices:result.choices.map(i=>({key:this.remember(i),title:i.title,type:i.mediaType,year:i.year,overview:i.overview.slice(0,300)}))};}));
        this.group('named_titles',results.flatMap(r=>r.match?[r.match.key]:[]));
        const choices=results.flatMap(r=>r.choices.map(c=>c.key));if(choices.length)this.group('ambiguous_titles',choices);
        return {results,instruction:results.some(r=>r.status==='ambiguous')?'Some titles have multiple actual matches. If the user has not supplied enough distinguishing detail, ask one short identifying question and wait. Do not repeat the same lookup, drop the year to guess, or discuss one candidate as though it were confirmed. On clarification use the retained candidate keys and title_details to verify plot/cast/director against the user\'s answer. Resolved titles need no confirmation.':'Use resolved identities directly, without another confirmation. For a read-only question, if a misspelling gives no result and you recognize a likely corrected title, resolve that corrected spelling once before asking the user. Do not invent its facts.'};
      }),
      tool('title_details','Read facts for one OR several canonical titles/people, for discussion, comparison, cast, episodes, availability and dated releases. Never filters named titles out based on Taste or services.',z.object({keys:z.array(z.string()).min(1).max(8),season:z.number().int().min(0).nullable(),episode:z.number().int().positive().nullable()}),async({keys,season,episode})=>{
        const hasTitles=keys.some(key=>this.known.get(key)?.type!=='person');
        const [viewerState,ratings]=hasTitles?await Promise.all([this.state(),this.titleRatings??=this.users.listFeedback(this.userId)]):[null,[]];
        const results=await Promise.all(keys.map(async key=>{
          const identity=this.known.get(key);if(!identity)throw new Error('UNVERIFIED_ENTITY');
          const item=identity.type==='person'?null:await this.title(key);
          const [facts,releases,episodes]=await Promise.all([
            identity.type==='series'&&season!==null&&episode!==null?this.catalog.episodeKnowledge?.(identity.id,season,episode):this.catalog.knowledge?.(identity.type,identity.id),
            identity.type!=='person'?this.catalog.releases?.(identity.type,identity.id,this.country):undefined,
            identity.type==='series'&&season!==null?this.catalog.season?.(identity.id,season):undefined,
          ]);
          for(const entry of [...(Array.isArray(facts?.cast)?facts.cast:[]),...(Array.isArray(facts?.crew)?facts.crew:[])] as Array<{id?:number;name?:string;title?:string;mediaType?:string}>){
            if(!entry.id)continue;
            if(identity.type==='person'){
              const type=entry.mediaType==='tv'?'series':entry.mediaType==='movie'?'movie':null;
              if(type&&(entry.title||entry.name)){const key=`${type}:${entry.id}`;this.known.set(key,{key,id:entry.id,type,title:entry.title??entry.name!,year:null});}
            }else if(entry.name)this.known.set(`person:${entry.id}`,{key:`person:${entry.id}`,id:entry.id,type:'person',title:entry.name,year:null});
          }
          return {identity,...(item?{title:summary(item),viewer:{rating:ratings.find(r=>`${r.mediaType}:${r.tmdbId}`===key)?.reaction??null,markedSeen:viewerState?.watchedKeys.has(key)??false,inWatchlist:viewerState?.watchlistKeys.has(key)??false}}:{}),facts,releases,episodes,source:'tmdb',country:this.country};
        }));this.group('discussed',keys);return {results,...(keys.length>1?{personalContext:await this.tasteBrief()}:{}),note:'Unknown or absent dates are not cancellation. Season dates are not proof of regional streaming availability.'};
      }),
      tool('find_person','Resolve an actor/director name. Use IDs from credits directly with title_details when available.',z.object({name:z.string().min(1).max(160)}),async({name})=>{
        const people=await this.catalog.people?.(name)??[];
        const candidates=people.slice(0,5).map(p=>({key:`person:${p.id}`,id:p.id,title:p.name,type:'person' as const,year:null}));
        for(const p of candidates)this.known.set(p.key,p);return {candidates,ambiguous:candidates.length!==1};
      }),
      tool('read_profile','Read the authenticated user’s saved data. Pages include total/hasMore; use recommend(source=watchlist) to choose FROM the library. Seen and watchlist are not Likes.',z.object({scope:z.enum(['taste','watchlist','seen','ratings','settings','reminders']),query:z.string().max(160),offset:z.number().int().min(0).max(100000)}),async({scope,query,offset})=>{
        const match=(s:string)=>!query||normalizeSearch(s).includes(normalizeSearch(query));
        const page=<T>(rows:T[])=>({total:rows.length,offset,items:rows.slice(offset,offset+60),hasMore:rows.length>offset+60,nextOffset:offset+60});
        if(scope==='taste'){const rows=(await this.users.getTaste(this.userId)).filter(s=>match([s.key,s.meaning,s.statement].filter(Boolean).join(' '))).sort((a,b)=>Number(b.explicit??false)-Number(a.explicit??false)||Math.abs(b.score*b.confidence)-Math.abs(a.score*a.confidence));return page(rows.map(s=>({dimension:s.dimension,topic:s.key,meaning:s.meaning,opinion:s.score<0?'dislike':s.score>0?'like':'neutral',strength:Math.abs(s.score),confidence:s.confidence,explicit:s.explicit,excluded:s.exclude,conditions:s.conditions,source:s.source})));}
        if(scope==='settings'){const s=await this.users.getSettings(this.userId);const favorites=await this.epg.listChannels(this.userId,s.profile.country,'',offset,true);return {country:s.profile.country,timezone:s.profile.timezone,services:s.services.map(p=>({id:p.providerId,name:p.providerName})),remindersEnabled:s.profile.remindersEnabled,behaviorPersonalization:s.profile.behaviorPersonalization,languages:s.languages.map(l=>({kind:l.kind,language:l.languageCode})),favoriteChannels:favorites.map(c=>({name:c.name,listingsAvailable:c.available})),favoritesOffset:offset,favoritesMayHaveMore:favorites.length===50};}
        if(scope==='reminders')return page((await this.users.listReminders(this.userId)).filter(r=>r.startsAt>new Date()&&match(r.title)).map(r=>({title:r.title,channel:r.channelName,start:r.startsAt,minutesBefore:r.offsetMinutes,active:r.active,note:'Saved record, not proof of phone delivery.'})));
        if(scope==='ratings'){
          const [ratings,saved,seen]=await Promise.all([this.users.listFeedback(this.userId),this.users.listWatchlist(this.userId),this.users.listHistory(this.userId)]);
          const names=new Map([...saved,...seen].map(r=>[`${r.mediaType}:${r.tmdbId}`,r.titleSnapshot]));
          if(query)for(const i of await this.catalog.search({query,region:this.country,summaryOnly:true}))names.set(titleKey(i),i.title);
          const matching=ratings.filter(r=>!query||match(names.get(`${r.mediaType}:${r.tmdbId}`)??'')),p=page(matching);
          const items=await batches(p.items,async r=>{const key=`${r.mediaType}:${r.tmdbId}`;let title=names.get(key);if(!title){const i=await this.catalog.getTitle(r.mediaType,r.tmdbId,this.country).catch(()=>null);if(i){this.remember(i);title=i.title;}}if(title)this.known.set(key,{key,type:r.mediaType,id:r.tmdbId,title,year:null});return {key,title:title??null,rating:r.reaction};});
          return {...p,items,note:'Ratings and Seen are independent. Missing titles are unavailable metadata, not missing ratings.'};
        }
        const rows=scope==='watchlist'?await this.users.listWatchlist(this.userId):await this.users.listHistory(this.userId);
        const filtered=rows.filter(r=>match(r.titleSnapshot));
        const result=page(filtered.map(r=>({key:`${r.mediaType}:${r.tmdbId}`,title:r.titleSnapshot,type:r.mediaType,id:r.tmdbId})));
        for(const r of result.items)if(r.type!=='episode')this.known.set(r.key,{...r,type:r.type,year:null});return result;
      }),
      tool('recommend','Retrieve and personally rank eligible candidates from the requested source. Choose the best fits for the CURRENT goal from returned metadata; do not blindly use score order. Keep emotional similarity separate from hard filters. For more, preserve source/seeds/filters and set continuation=true. Library coverage is paged, never silently truncated.',recommendationRequestSchema,value=>this.recommend(value)),
      tool('find_channels','Resolve TV channel names/abbreviations to verified IDs before tv_guide. Existing context channel IDs can be used directly. Country defaults to the user country; another country only when the user requests it.',z.object({query:z.string().max(160),country:z.string().nullable(),offset:z.number().int().min(0).max(10000)}),async({query,country,offset})=>{
        const code=country??this.country;if(!(code in countryTimezones))throw new Error('UNSUPPORTED_COUNTRY');
        const search=normalizeSearch(query).replaceAll(' ','');
        const rows=(await this.epg.chatChannels(code)).filter(c=>!search||normalizeSearch(c.name).replaceAll(' ','').includes(search));
        return {country:code,channels:rows.slice(offset,offset+60),total:rows.length,nextOffset:offset+60<rows.length?offset+60:null};
      }),
      tool('tv_guide','Read verified TV data using YOUR structured interpretation, not a second intent planner. channelIds must come from find_channels or context. For now use window=live,date=null,time=null (the server uses its exact clock). next uses the shown broadcast anchor or the live programme on one channel. Leave clarification=null unless genuinely ambiguous. A next lookup is first_page, not more.',tvPlanSchema.extend({question:z.string().min(1).max(1200)}),async value=>{
        const blocks=await new ChatTvGuide(this.users,this.catalog,this.ai,this.epg).handle(this.userId,this.sessionId,value.question,false,value);
        const current=await this.users.getSessionContext(this.userId,this.sessionId),country=(current.tv as {country?:string}|undefined)?.country??value.country??this.country;
        const timezone=countryTimezones[country]??(await this.users.getSettings(this.userId)).profile.timezone;
        const format=(d:unknown)=>new Intl.DateTimeFormat('en-GB',{timeZone:timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(d as string));
        const tagged=blocks.map(b=>b.type==='tv_carousel'?{...b,items:b.items.map(p=>({...p,country,startLocal:format(p.startAt),endLocal:format(p.endAt)}))}:b);
        this.extraBlocks.push(...tagged.filter(b=>b.type!=='text'&&b.type!=='quick_actions'));return {blocks:tagged,country,timezone,status:'verified_tool_result'};
      }),
      tool('release_calendar','Browse upcoming cinema releases with country-specific dates. Use your structured interpretation directly. For more retain country/date range and continuation=true. For named title release dates prefer title_details if its key is already known. No listed date means unknown, not cancelled.',releasePlanSchema.extend({question:z.string().min(1).max(1200)}),async value=>{
        const blocks=await new ChatReleases(this.users,this.catalog,this.ai).handle(this.userId,this.sessionId,value.question,value);
        for(const b of blocks)if(b.type==='movie_carousel')for(const item of b.items)this.remember(item);
        const context=await this.users.getSessionContext(this.userId,this.sessionId);
        const browse=context.releaseBrowse as {hasMore?:boolean}|undefined;
        this.extraBlocks.push(...blocks.filter(b=>b.type!=='text'&&b.type!=='movie_carousel'&&b.type!=='quick_actions'));
        return {blocks,candidates:blocks.flatMap(b=>b.type==='movie_carousel'?b.items.map(i=>({key:titleKey(i),title:i.title,releaseDate:i.releaseDate})):[]),hasMore:Boolean(browse?.hasMore||(context.releasePending as unknown[]|undefined)?.length),instruction:'Use the supplied canonical keys directly for cards; no title search is necessary. Any knowledge block is displayed verbatim with its citations, so do not repeat that answer in final text.'};
      }),
      tool('current_news','Only for current entertainment announcements or facts absent from catalog (cancellation, filming, true story). Uses the already configured OpenAI web search. Preserve citations; never use for recipes/code or personal data.',z.object({question:z.string().min(1).max(1000)}),async({question})=>{
        if(this.newsAnswered)return {status:'already_answered',instruction:'A sourced answer has already been supplied and will be displayed. Do not start follow-up research the user did not ask for. Finish this turn using that evidence.'};
        const answer=await this.ai.answerKnowledge(question,{scope:'Entertainment only. The question must be self-contained; no private profile, library or Taste is sent to web search.'},true);this.newsAnswered=answer.type==='knowledge';this.extraBlocks.push(answer);return {answer,instruction:'This sourced answer is displayed verbatim with its citations. Do not repeat or paraphrase it in final text or research additional follow-up questions on your own. Only answer any other remaining part of the actual user request.'};
      }),
      tool('explain_pick','Read recorded recommendation evidence for a title; no made-up explanation.',z.object({question:z.string().min(1).max(600)}),async({question})=>({blocks:await new ChatExplain(this.users,this.ai,this.catalog).handle(this.userId,this.sessionId,question)})),
      tool('cancel_pending','Cancel an unconfirmed proposal or pending Taste clarification when the user declines it. Does not undo already saved data. Use for natural replies such as never mind or do not apply that.',z.object({}),async()=>{
        const context=await this.users.getSessionContext(this.userId,this.sessionId);
        const pending=Boolean(context.chatPlan||context.tasteEditPlan||context.tastePending||context.tasteEditPending);
        delete context.chatPlan;delete context.tasteEditPlan;delete context.tastePending;delete context.tasteEditPending;
        await this.users.setSessionContext(this.userId,this.sessionId,context);
        const blocks:ChatBlock[]=[{type:'text',content:pending?'Cancelled the pending changes. Your saved library and Taste are unchanged.':'There are no pending changes to cancel. Previously saved changes have not been undone.'}];
        this.authoritative.push(...blocks);return {authoritative:true,blocks};
      },true),
      tool('prepare_change','Process the ORIGINAL human request through existing verified Taste/library/reminder safeguards. At most one per turn. Returns an authoritative receipt or confirmation preview; cannot confirm or execute a preview. Do not use for questions, hypotheticals or temporary moods.',z.object({kind:z.enum(['taste','library','correction'])}),async({kind})=>{
        const blocks=await this.change(kind);if(!blocks.length)return {status:'read_only_request',instruction:'Nothing changed. This is a question, not authorization to save preferences. Use read_profile to answer it.'};this.authoritative.push(...blocks);this.recommendationState=undefined;this.titleRatings=undefined;return {authoritative:true,blocks,instruction:'The app renders these blocks exactly. Do not claim any additional change or repeat the receipt in final text.'};
      },true),
    ];
  }
  async recommend(value:z.infer<typeof recommendationRequestSchema>){
    const state=await this.state(),previous=this.memory.request;
    // Continuations inherit the complete request. Refinements are supplied as a
    // complete filter by the single assistant, rather than inferred word rules.
    const filters=value.continuation&&previous?{...previous.filters,...Object.fromEntries(value.changedFilters.map(key=>[key,value.filters[key]]))}:value.filters;
    const request=value.continuation&&previous?{...value,goal:value.goal||previous.goal,filters,source:previous.source,keys:previous.keys.length?previous.keys:value.keys}:value;
    const shown=new Set(value.continuation?this.memory.shown:[]);
    const query=filterQuerySchema.parse({...request.filters,intent:'DISCOVERY',tvWindow:null});
    let pool:ContentItem[],total:number|undefined,nextOffset:number|null=null,failed=0;
    if(request.source==='watchlist'||request.source==='seen'){
      const rows=request.source==='watchlist'?await this.users.listWatchlist(this.userId):await this.users.listHistory(this.userId);
      total=rows.length;const rawPage=rows.slice(request.offset,request.offset+60),page=rawPage.flatMap(r=>r.mediaType==='episode'?[]:[{mediaType:r.mediaType,tmdbId:r.tmdbId}]);
      const hydrated=await batches(page,async r=>{const item=await this.catalog.getTitle(r.mediaType,r.tmdbId,state.country,state.ownedProviderIds).catch(()=>null);if(!item)failed++;return item;});
      pool=hydrated.filter((i):i is ContentItem=>!!i);nextOffset=request.offset+rawPage.length<rows.length?request.offset+rawPage.length:null;
    }else if(request.source==='named')pool=await Promise.all(request.keys.map(key=>this.title(key)));
    else {
      const seed=request.keys.length?await this.title(request.keys[0]!):undefined;
      if(seed)query.similarTo=seed.title;
      pool=await generateCandidates(this.catalog,state,query,seed,1+Math.floor(shown.size/8));
    }
    // Only catalog similarity seeds are exclusions. A model may helpfully pass
    // IDs it just read from Watchlist/Seen; those are candidates, not exclusions.
    const eligible=pool.filter(i=>!shown.has(titleKey(i))&&(request.source!=='catalog'||!request.keys.includes(titleKey(i))));
    // Keywords used to retrieve a nuanced story are not a reliable exact-match
    // gate. The model reviews actual descriptions; hard exclusions remain.
    const scoringQuery={...query,keywords:[],keywordMatch:'any' as const};
    // Existing embeddings remain. A second LLM reviewer is redundant because
    // this assistant already sees and selects the candidates itself.
    const personal=await personalizationFor(this.users,this.catalog).prepare(eligible,{...state,recommendationEngine:state.recommendationEngine==='semantic_ai'?'semantic':state.recommendationEngine??'baseline'},this.userId,scoringQuery);
    const ranked=rankCandidates(eligible,scoringQuery,{...state,...personal,viewerIds:[this.userId],temporaryMoods:query.moods},36);
    for(const r of ranked){this.remember(r.item);this.ranked.set(titleKey(r.item),r);}
    // A second library page must not invalidate candidates read on the first.
    // Changed constraints or a new topic must not carry older eligible IDs over.
    const scope=JSON.stringify([request.source,request.keys,query]);
    const append=request.continuation&&request.offset>0&&scope===this.candidateScope;
    this.recommendationKeys=new Set([...(append?this.recommendationKeys??[]:[]),...ranked.map(r=>titleKey(r.item))]);
    this.candidateScope=scope;
    this.memory.request={...request,filters:query};this.memory.shown=[...shown];
    return {status:ranked.length?'candidates':failed?'partial_failure':'no_eligible_candidates',goal:request.goal,source:request.source,personalContext:await this.tasteBrief(),candidates:ranked.map(r=>({...summary(r.item),personalReason:r.reason})),coverage:{total,checked:pool.length,failed,nextOffset,complete:nextOffset===null&&failed===0},filters:query,
      instruction:'Select only candidates that genuinely fit the current goal. No selection is preferable to unrelated fillers. If coverage is partial, do not claim the whole library was searched. If there are no eligible items, explain the actual active constraints; do not invent constraints.'};
  }
  cardCorrection(selected:string[]){
    const broadcasts=new Set(this.extraBlocks.flatMap(b=>b.type==='tv_carousel'?b.items.map(p=>p.id):[]));
    const allowed=this.recommendationKeys?[...this.recommendationKeys]:[...this.known.values()].filter(e=>e.type!=='person').map(e=>e.key);
    const allowedSet=new Set(allowed);
    if(selected.every(key=>allowedSet.has(key)||broadcasts.has(key)))return null;
    return `The proposed card selection contains IDs outside the verified eligible set. Correct this final answer only; do not execute any more tools or changes. Select only from these canonical keys: ${JSON.stringify(allowed.slice(0,80))}. TV cards are already displayed. Remove any unsupported title recommendations from prose too. If no supplied candidate genuinely fits, return empty cards and honestly explain the limitation. Do not repeat previously excluded recommendations.`;
  }
  async finish(selected:string[]){
    // A follow-up may reuse verified identities from memory without calling a
    // lookup again. Refresh their public metadata before rendering, never turn
    // a remembered ID into an unverified/stale availability card.
    await batches([...new Set(selected)].filter(key=>!this.items.has(key)&&this.known.has(key)&&this.known.get(key)!.type!=='person'&&(!this.recommendationKeys||this.recommendationKeys.has(key))).slice(0,8),key=>this.title(key).catch(()=>null));
    const valid=[...new Set(selected)].filter(key=>this.items.has(key)&&(!this.recommendationKeys||this.recommendationKeys.has(key)));
    if(this.recommendationKeys){this.memory.shown=[...new Set([...this.memory.shown,...valid])].slice(-2000);await this.users.recordRecommendations(this.userId,valid.flatMap(k=>this.ranked.has(k)?[this.ranked.get(k)!]:[]),this.sessionId);}
    if(valid.length)this.group('displayed',valid);
    this.memory.entities=this.retainedEntities();
    const context=await this.users.getSessionContext(this.userId,this.sessionId);
    await this.users.setSessionContext(this.userId,this.sessionId,{...context,assistantMemory:this.memory});
    return valid.map(k=>this.items.get(k)!);
  }
}
