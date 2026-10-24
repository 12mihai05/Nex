import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createClient} from '@libsql/client';
import {drizzle} from 'drizzle-orm/libsql';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {eq} from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import {UserRepository} from '../src/repositories/user-repository.js';
import {FixtureTmdbRepository} from '../src/repositories/tmdb-repository.js';
import {fixtureCatalog} from '../src/fixtures/catalog.js';
import {AiService} from '../src/services/ai.js';
import {EpgService} from '../src/services/epg/service.js';
import {AssistantTools,recommendationRequestSchema,assistantMemorySchema} from '../src/services/assistant-tools.js';
import {resolveAssistantTitle} from '../src/services/assistant-resolver.js';
import {ChatService} from '../src/services/chat.js';
import type {AssistantStep} from '../src/services/assistant-loop.js';
import {ChatRequestRepository} from '../src/repositories/chat-request-repository.js';
import {tvPlanSchema} from '../src/services/tv-plan.js';
import {releasePlanSchema} from '../src/services/chat-capability-plans.js';
import {ChatTvGuide} from '../src/services/chat-tv-guide.js';

let client:ReturnType<typeof createClient>,db:ReturnType<typeof drizzle<typeof schema>>,users:UserRepository,session:string,catalog:FixtureTmdbRepository,ai:AiService,epg:EpgService;
const item=(id:number)=>({...fixtureCatalog[0]!,id,title:`Title ${id}`,runtimeMinutes:100,mediaType:'movie' as const});
beforeEach(async()=>{
 client=createClient({url:':memory:'});const dir=fileURLToPath(new URL('../drizzle/',import.meta.url));
 for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())await client.executeMultiple((await readFile(dir+'/'+name,'utf8')).replaceAll('--> statement-breakpoint',''));
 db=drizzle(client,{schema});users=new UserRepository(db);ai=new AiService('');catalog=new FixtureTmdbRepository();epg=new EpgService(db);
 await db.insert(schema.user).values(['alice','bob'].map(id=>({id,name:id,email:id+'@example.test'})));await users.updateSettings('alice',{country:'RO',timezone:'Europe/Bucharest'});session=await users.createConversation('alice');
});
afterEach(()=>{vi.restoreAllMocks();client.close();});
const adapters=(memory:unknown={})=>new AssistantTools(users,catalog,ai,epg,'alice',session,'question','RO',memory,async()=>[{type:'text',content:'Preview only'}]);
const request=(overrides:Record<string,unknown>={})=>recommendationRequestSchema.parse({source:'watchlist',keys:[],goal:'Choose from my watchlist',continuation:false,offset:0,filters:{intent:'DISCOVERY',availabilityScope:'all_providers',excludeWatched:false},changedFilters:[],...overrides});
it.each([false,true])('keeps verified broadcast cards distinct from movie keys; forged=%s',async forged=>{
 const broadcast={id:'broadcast-1',title:'Tennis final',startAt:new Date(),endAt:new Date(Date.now()+3600000),channel:{id:'channel-1',name:'Sports'},favorite:false};
 vi.spyOn(ChatTvGuide.prototype,'handle').mockResolvedValue([{type:'tv_carousel',items:[broadcast]}]);
 vi.spyOn(ai,'mode','get').mockReturnValue('live');
 const args={question:'What is good on TV?',mode:'recommend',pagination:'first_page',country:null,channelIds:[],window:'live',horizonHours:3,date:null,time:null,anchorId:null,title:null,year:null,goal:'Something good',clarification:null};
 vi.spyOn(ai,'assistantStep').mockResolvedValueOnce({output:[{type:'function_call',name:'tv_guide',arguments:JSON.stringify(args),call_id:'tv'}],answer:null,inputTokens:1,outputTokens:1}).mockResolvedValue({output:[],answer:{text:'Try the tennis final.',cards:[forged?'invented-broadcast':'broadcast-1'],suggestions:[]},inputTokens:1,outputTokens:1});
 const result=await new ChatService(users,catalog,ai,epg,{toolAssistant:true}).respond('alice','What is good on TV?',session);
 expect(result.blocks.flatMap(b=>b.type==='tv_carousel'?b.items:[])).toHaveLength(1);
 expect(result.blocks.some(b=>b.type==='movie_carousel')).toBe(false);
 expect(result.blocks.some(b=>b.type==='text'&&b.content.includes('couldn’t verify'))).toBe(forged);
});
it('never shares fallback memory across conversations or users in a warm server',async()=>{
 const first=adapters();first.memory.entities.push({key:'movie:1',id:1,type:'movie',title:'Private choice',year:null});
 first.memory.groups.push({kind:'private',keys:['movie:1']});first.memory.shown.push('movie:1');first.memory.request=request();
 const second=adapters();const bob=await users.createConversation('bob');
 const other=new AssistantTools(users,catalog,ai,epg,'bob',bob,'Hello','RO',{},async()=>[]);
 for(const fresh of [second,other]){expect(fresh.memory).toEqual({version:1,entities:[],groups:[],request:null,shown:[]});expect(fresh.known.size).toBe(0);}
});
it('executes structured now/next TV requests without a second planner and stores mixed cards in one position sequence',async()=>{
 const now=Date.now();await db.insert(schema.channels).values({id:'ppv2',sourceId:'test',externalId:'ppv2',displayName:'Prima Sport PPV2',country:'RO'});
 await db.insert(schema.epgPrograms).values([
  {id:'off',title:'Fără Emisie',startAt:new Date(now-3600000),endAt:new Date(now+3600000)},
  {id:'next',title:'Tennis final',startAt:new Date(now+3600000),endAt:new Date(now+7200000)},
 ].map(p=>({...p,channelId:'ppv2',sourceId:'test',sourceProgramId:p.id})));
 const plan=tvPlanSchema.parse({mode:'schedule',pagination:'first_page',country:null,channelIds:['ppv2'],window:'live',date:null,time:null,anchorId:null,title:null,year:null,goal:'What is on now?',clarification:null});
 const call=(value:unknown,id:string)=>({output:[{type:'function_call' as const,name:'tv_guide',arguments:JSON.stringify(value),call_id:id}],answer:null,inputTokens:1,outputTokens:1});
 vi.spyOn(ai,'mode','get').mockReturnValue('live');const oldPlanner=vi.spyOn(ai,'planTv');
 vi.spyOn(ai,'assistantStep').mockResolvedValueOnce(call({...plan,question:'What is on PPV2 now?'},'now')).mockResolvedValueOnce(call({...plan,mode:'next',anchorId:'off',question:'What is next?'},'next')).mockResolvedValueOnce({output:[],answer:{text:'Off air now, then tennis.',cards:[],suggestions:[]},inputTokens:1,outputTokens:1});
 const response=await new ChatService(users,catalog,ai,epg,{toolAssistant:true}).respond('alice','What is on PPV2 now and next?',session);
 expect(oldPlanner).not.toHaveBeenCalled();expect(response.blocks.flatMap(b=>b.type==='tv_carousel'?b.items.map(p=>p.id):[])).toEqual(['off','next']);
 const refs=await users.recentDisplayedItems('alice',session);expect(refs.map(r=>r.position)).toEqual([1,2]);expect(refs.map(r=>r.externalId)).toEqual(['off','next']);
 expect(JSON.stringify(response)).toContain('startLocal');
});
it('retains discussed titles when large cast lists fill the bounded memory',async()=>{
 const a=adapters();a.known.set('movie:1',{key:'movie:1',id:1,type:'movie',title:'First',year:null});
 a.memory.groups=[{kind:'discussed',keys:['movie:1']}];
 for(let id=1;id<=120;id++)a.known.set(`person:${id}`,{key:`person:${id}`,id,type:'person',title:`Actor ${id}`,year:null});
 await a.finish([]);expect(a.context().entities).toHaveLength(80);expect(a.context().entities[0]?.key).toBe('movie:1');
});
it('provides canonical upcoming keys and coverage without another intent model',async()=>{
 const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
 Object.assign(catalog,{upcoming:vi.fn(async()=>({items:[{...item(99),releaseDate:date}],hasMore:false}))});
 const planner=vi.spyOn(ai,'structured'),a=adapters();
 const plan=releasePlanSchema.parse({mode:'upcoming',title:'',mediaType:'movie',year:null,country:'RO',from:null,to:null,continuation:false,news:false,clarification:null});
 const result=await a.registry().find(t=>t.name==='release_calendar')!.execute({...plan,question:'What is coming soon?'}) as {candidates:unknown[];hasMore:boolean};
 expect(result.candidates).toEqual([{key:'movie:99',title:'Title 99',releaseDate:date}]);expect(result.hasMore).toBe(false);expect(planner).not.toHaveBeenCalled();
 expect((await a.finish(['movie:99'])).map(i=>i.id)).toEqual([99]);
});
it('does not pay for or display a second speculative news follow-up in the same turn',async()=>{
 const answer=vi.spyOn(ai,'answerKnowledge').mockResolvedValue({type:'knowledge',content:'Verified answer.',citations:[{title:'Source',url:'https://example.com',start:0,end:8}]});
 const a=adapters(),news=a.registry().find(t=>t.name==='current_news')!;
 await news.execute({question:'Why cancelled?'});
 expect(await news.execute({question:'Research additional metrics too'})).toMatchObject({status:'already_answered'});
 expect(answer).toHaveBeenCalledTimes(1);expect(a.extraBlocks).toHaveLength(1);
});
it('interprets a person filmography as titles rather than creating fabricated people',async()=>{
 const a=adapters();a.known.set('person:42',{key:'person:42',id:42,type:'person',title:'Director',year:null});
 Object.assign(catalog,{knowledge:vi.fn(async()=>({crew:[{id:1,title:'Film',mediaType:'movie',job:'Director'},{id:2,title:'Show',mediaType:'tv',job:'Writer'}]}))});
 await a.registry().find(t=>t.name==='title_details')!.execute({keys:['person:42'],season:null,episode:null});
 expect(a.known.get('movie:1')?.title).toBe('Film');expect(a.known.get('series:2')?.title).toBe('Show');expect(a.known.has('person:1')).toBe(false);
});
it('provides names for ratings without manufacturing Seen and reads favorite channel settings',async()=>{
 await users.setFeedback('alice','movie',1,'like');vi.spyOn(catalog,'getTitle').mockResolvedValue(item(1));
 const a=adapters(),read=a.registry().find(t=>t.name==='read_profile')!;
 expect(await read.execute({scope:'ratings',query:'',offset:0})).toMatchObject({items:[{key:'movie:1',title:'Title 1',rating:'like'}]});expect(await users.listHistory('alice')).toHaveLength(0);
 vi.spyOn(epg,'listChannels').mockResolvedValue([]);
 expect(await read.execute({scope:'settings',query:'',offset:0})).toMatchObject({favoriteChannels:[],country:'RO'});
});
it('includes the current user title opinion separately from Seen and watchlist, without another-user contamination',async()=>{
 await users.setFeedback('alice','movie',1,'dislike');await users.setFeedback('bob','movie',2,'super_like');
 await users.addWatchlist('alice',item(2));await users.markWatched('bob',item(1));
 vi.spyOn(catalog,'getTitle').mockImplementation(async(_,id)=>item(id));
 const ratings=vi.spyOn(users,'listFeedback'),a=adapters();
 for(const id of [1,2])a.known.set(`movie:${id}`,{key:`movie:${id}`,id,type:'movie',title:`Title ${id}`,year:null});
 const read=a.registry().find(t=>t.name==='title_details')!;
 const result=await read.execute({keys:['movie:1','movie:2'],season:null,episode:null});
 expect(result).toMatchObject({results:[{viewer:{rating:'dislike',markedSeen:false,inWatchlist:false}},{viewer:{rating:null,markedSeen:false,inWatchlist:true}}]});
 await read.execute({keys:['movie:1'],season:null,episode:null});expect(ratings).toHaveBeenCalledTimes(1);
 // A new turn must see a changed rating, not a cross-turn profile snapshot.
 await users.setFeedback('alice','movie',1,'like');await a.finish([]);
 const next=adapters((await users.getSessionContext('alice',session)).assistantMemory);
 expect(await next.registry().find(t=>t.name==='title_details')!.execute({keys:['movie:1'],season:null,episode:null})).toMatchObject({results:[{viewer:{rating:'like',markedSeen:false}}]});
 expect(await users.listHistory('alice')).toHaveLength(0);
});
it('refreshes remembered verified identities before rendering a follow-up without accepting invented IDs',async()=>{
 const a=adapters();a.known.set('movie:1',{key:'movie:1',id:1,type:'movie',title:'First',year:null});
 const get=vi.spyOn(catalog,'getTitle').mockResolvedValue(item(1));
 expect((await a.finish(['movie:1','movie:999'])).map(i=>i.id)).toEqual([1]);expect(get).toHaveBeenCalledTimes(1);
});
it('reports missing title metadata as incomplete coverage, not an empty matching library',async()=>{
 await users.addWatchlist('alice',item(1));vi.spyOn(catalog,'getTitle').mockResolvedValue(null);
 expect((await adapters().recommend(request())).coverage).toMatchObject({failed:1,complete:false});
});
it('does not mistake supplied watchlist identities for similarity seeds to exclude',async()=>{
 await users.addWatchlist('alice',item(1));await users.addWatchlist('alice',item(2));
 vi.spyOn(catalog,'getTitle').mockImplementation(async(_,id)=>item(id));
 const result=await adapters().recommend(request({keys:['movie:1','movie:2']}));
 expect(result.candidates.map(i=>i.key).sort()).toEqual(['movie:1','movie:2']);
});
it('replays only the identical request and blocks clearing or overlapping an active turn',async()=>{
 const r=new ChatRequestRepository(db);
 expect(await r.claim('alice','one','Hi',session)).toEqual({status:'claimed'});
 expect(await r.claim('alice','one','Hi',session)).toEqual({status:'busy'});
 expect(await r.claim('alice','two','Different',session)).toEqual({status:'busy'});
 expect(await r.claim('alice','one','Changed',session)).toEqual({status:'conflict'});
 await expect(users.clearConversations('alice')).rejects.toThrow('CHAT_BUSY');
 const response={sessionId:session,blocks:[{type:'text' as const,content:'Saved reply'}]};
 await r.complete('alice','one',response);
 expect(await r.claim('alice','one','Hi',session)).toEqual({status:'completed',response});
 expect(await r.claim('bob','one','Hi')).toEqual({status:'claimed'});
 await users.clearConversations('alice');expect((await db.select().from(schema.chatRequests)).map(r=>r.userId)).toEqual(['bob']);
});
it('does not replay uncertain requests after a crash, but allows a new request',async()=>{
 const r=new ChatRequestRepository(db),old=new Date(Date.now()-700_000);
 await r.claim('alice','old','Change',session,old);
 expect(await r.claim('alice','old','Change',session)).toEqual({status:'interrupted'});
 expect(await r.claim('alice','new','Check status',session)).toEqual({status:'claimed'});
 await r.interrupt('alice','new');expect(await r.claim('alice','new','Check status',session)).toEqual({status:'interrupted'});
});
it('serializes simultaneous HTTP claims without accepting two active turns',async()=>{
 const r=new ChatRequestRepository(db);
 const results=await Promise.all([r.claim('alice','first','Hi',session),r.claim('alice','second','Hi',session)]);
 expect(results.map(r=>r.status).sort()).toEqual(['busy','claimed']);
 expect((await db.select().from(schema.chatRequests)).filter(r=>r.status==='running')).toHaveLength(1);
});
it('allows clearing a stale crashed request after the bounded work window',async()=>{
 await new ChatRequestRepository(db).claim('alice','stale','Hi',session,new Date(Date.now()-700_000));
 await users.clearConversations('alice');expect(await db.select().from(schema.chatRequests)).toEqual([]);
});
it('cancellation disarms previews and clarifications without deleting saved preferences or library',async()=>{
 await users.addWatchlist('alice',item(1));await users.setSessionContext('alice',session,{chatPlan:{id:'pending'},tasteEditPlan:{id:'pending'},tastePending:{request:'Maybe'},assistantMemory:{version:1}});
 const a=adapters();await a.registry().find(t=>t.name==='cancel_pending')!.execute({});
 const context=await users.getSessionContext('alice',session);
 expect(context.chatPlan).toBeUndefined();expect(context.tasteEditPlan).toBeUndefined();expect(context.tastePending).toBeUndefined();expect(context.assistantMemory).toEqual({version:1});
 expect(await users.listWatchlist('alice')).toHaveLength(1);expect(a.authoritative[0]).toMatchObject({type:'text',content:expect.stringContaining('Cancelled')});
});
it.each(['Cruela','Curela','Cruella'])('resolves the unambiguous provider result for %s without demanding year',async query=>{
 vi.spyOn(catalog,'search').mockResolvedValue([{...item(337404),title:'Cruella',originalTitle:'Cruella',year:2021}]);
 expect((await resolveAssistantTitle(catalog,query,'RO','movie',null)).match?.id).toBe(337404);
});
it('does not accept an unrelated sole search result as a spelling correction',async()=>{
 vi.spyOn(catalog,'search').mockResolvedValue([{...item(337404),title:'Cruella',originalTitle:'Cruella',year:2021}]);
 expect((await resolveAssistantTitle(catalog,'Gravity','RO','movie',null)).match).toBeUndefined();
});
it('does not resolve a typo when two remakes remain equally plausible',async()=>{
 vi.spyOn(catalog,'search').mockResolvedValue([1982,2011].map(year=>({...item(year),title:'The Thing',originalTitle:'The Thing',year})));
 expect((await resolveAssistantTitle(catalog,'The Thnig','RO','movie',null)).status).toBe('ambiguous');
});
it('does not guess between remakes with the same name',async()=>{
 vi.spyOn(catalog,'search').mockResolvedValue([{...item(1),title:'The Thing',year:1982},{...item(2),title:'The Thing',year:2011}]);
 expect((await resolveAssistantTitle(catalog,'The Thing','RO','movie',null)).status).toBe('ambiguous');
 expect((await resolveAssistantTitle(catalog,'The Thing','RO','movie',1982)).match?.id).toBe(1);
});
it('tells the assistant to clarify actual same-year ambiguity once, not retry until it guesses',async()=>{
 vi.spyOn(catalog,'search').mockResolvedValue([1,2].map(id=>({...item(id),title:'Arrival',year:2016})));
 const result=await adapters().registry().find(t=>t.name==='resolve_titles')!.execute({titles:[{query:'Arrival',type:'movie',year:2016}]});
 expect(result).toMatchObject({results:[{status:'ambiguous',match:null}],instruction:expect.stringContaining('ask one short identifying question')});
});
it('retains verified same-year alternatives for a later plot/cast clarification without inventing IDs',async()=>{
 vi.spyOn(catalog,'search').mockResolvedValue([1,2].map(id=>({...item(id),title:'Arrival',year:2016,overview:id===1?'A linguist meets aliens.':'A short drama.'})));
 const a=adapters();await a.registry().find(t=>t.name==='resolve_titles')!.execute({titles:[{query:'Arrival',type:'movie',year:2016}]});
 await a.finish([]);
 const context=await users.getSessionContext('alice',session),next=adapters(context.assistantMemory);
 expect(next.context()).toMatchObject({groups:expect.arrayContaining([{kind:'ambiguous_titles',keys:['movie:1','movie:2']}])});
 const get=vi.spyOn(catalog,'getTitle').mockImplementation(async(_,id)=>item(id));
 const result=await next.registry().find(t=>t.name==='title_details')!.execute({keys:['movie:1'],season:null,episode:null});
 expect(result).toMatchObject({results:[{identity:{key:'movie:1'}}]});expect(get).toHaveBeenCalled();
 await expect(next.registry().find(t=>t.name==='title_details')!.execute({keys:['movie:999999'],season:null,episode:null})).rejects.toThrow('UNVERIFIED_ENTITY');
});
it('verifies a regional search year against canonical details before rejecting a named film',async()=>{
 const title={...item(153),title:'Lost in Translation',originalTitle:'Lost in Translation',year:2004};
 vi.spyOn(catalog,'search').mockResolvedValue([title]);
 const get=vi.spyOn(catalog,'getTitle').mockResolvedValue({...title,year:2003});
 expect((await resolveAssistantTitle(catalog,title.title,'RO','movie',2003)).match).toMatchObject({id:153,year:2003});
 expect(get).toHaveBeenCalledExactlyOnceWith('movie',153,'RO');
});
it.each(['wrong_year','unavailable','wrong_identity'])('does not relax a requested year without verified matching details: %s',async mode=>{
 const title={...item(153),title:'Lost in Translation',year:2004};
 vi.spyOn(catalog,'search').mockResolvedValue([title]);
 vi.spyOn(catalog,'getTitle').mockImplementation(async()=>{if(mode==='unavailable')throw new Error('provider unavailable');return mode==='wrong_identity'?{...title,id:999,year:2003}:title;});
 expect((await resolveAssistantTitle(catalog,title.title,'RO','movie',2003)).match).toBeUndefined();
});
it('bounds regional-year verification and preserves genuine ambiguity after canonical hydration',async()=>{
 const titles=Array.from({length:6},(_,i)=>({...item(i+1),title:'Same title',originalTitle:'Same title',year:2004}));
 vi.spyOn(catalog,'search').mockResolvedValue(titles);
 const get=vi.spyOn(catalog,'getTitle').mockImplementation(async(_,id)=>({...titles[id-1]!,year:2003}));
 expect((await resolveAssistantTitle(catalog,'Same title','RO','movie',2003)).status).toBe('ambiguous');
 expect(get).toHaveBeenCalledTimes(4);
 get.mockClear();await resolveAssistantTitle(catalog,'Same title','RO','movie',null);expect(get).not.toHaveBeenCalled();
});
it('searches past the former six-title watchlist cap and never introduces unrelated catalog results',async()=>{
 for(let i=1;i<=12;i++)await users.addWatchlist('alice',item(i));
 const get=vi.spyOn(catalog,'getTitle').mockImplementation(async(_,id)=>item(id));
 const discover=vi.spyOn(catalog,'discover');const a=adapters(),out=await a.recommend(request());
 expect(get).toHaveBeenCalledTimes(12);expect(discover).not.toHaveBeenCalled();expect(out.coverage).toMatchObject({total:12,checked:12,complete:true});expect(out.candidates).toHaveLength(12);
 expect(out.candidates.every(i=>i.key.startsWith('movie:'))).toBe(true);
});
it('reports incomplete large-library coverage and supplies a usable next page',async()=>{
 for(let i=1;i<=65;i++)await users.addWatchlist('alice',item(i));
 vi.spyOn(catalog,'getTitle').mockImplementation(async(_,id)=>item(id));const a=adapters();
 const first=await a.recommend(request());expect(first.coverage).toMatchObject({checked:60,nextOffset:60,complete:false});
 const next=await a.recommend(request({continuation:true,offset:60}));expect(next.coverage).toMatchObject({checked:5,nextOffset:null,complete:true});
 expect((await a.finish([first.candidates[0]!.key,next.candidates[0]!.key]))).toHaveLength(2);
});
it('does not retain first-page candidates after a stricter refinement',async()=>{
 for(let i=1;i<=2;i++)await users.addWatchlist('alice',item(i));
 vi.spyOn(catalog,'getTitle').mockImplementation(async(_,id)=>({...item(id),runtimeMinutes:id===1?130:90}));const a=adapters();
 await a.recommend(request());await a.recommend(request({continuation:true,changedFilters:['maxRuntimeMinutes'],filters:{intent:'DISCOVERY',availabilityScope:'all_providers',maxRuntimeMinutes:100}}));
 expect((await a.finish(['movie:1','movie:2'])).map(i=>i.id)).toEqual([2]);
});
it('retains explicit constraints, source and seen recommendation IDs on more, without making them permanent Taste',async()=>{
 for(let i=1;i<=10;i++)await users.addWatchlist('alice',item(i));vi.spyOn(catalog,'getTitle').mockImplementation(async(_,id)=>item(id));const a=adapters();
 await a.recommend(request({filters:{intent:'DISCOVERY',availabilityScope:'all_providers',maxRuntimeMinutes:110}}));await a.finish(['movie:1','movie:2']);
 const out=await a.recommend(request({source:'catalog',continuation:true}));expect(out.source).toBe('watchlist');expect(out.filters.maxRuntimeMinutes).toBe(110);expect(out.candidates.map(i=>i.key)).not.toContain('movie:1');expect(await users.getTaste('alice')).toEqual([]);
});
it('allows a genuinely new request to show a title from a previous request',async()=>{
 await users.addWatchlist('alice',item(1));vi.spyOn(catalog,'getTitle').mockResolvedValue(item(1));const a=adapters();await a.recommend(request());await a.finish(['movie:1']);
 expect((await a.recommend(request())).candidates.map(i=>i.key)).toEqual(['movie:1']);
});
it('honors explicit runtime and dislikes in watchlist recommendations',async()=>{
 for(let i=1;i<=3;i++)await users.addWatchlist('alice',item(i));await users.setFeedback('alice','movie',2,'dislike');
 vi.spyOn(catalog,'getTitle').mockImplementation(async(_,id)=>({...item(id),runtimeMinutes:id===3?150:100}));
 expect((await adapters().recommend(request({filters:{intent:'DISCOVERY',availabilityScope:'all_providers',maxRuntimeMinutes:110}}))).candidates.map(i=>i.key)).toEqual(['movie:1']);
});
it('keeps named comparison films even if watched or unavailable on owned services',async()=>{
 const a=adapters();vi.spyOn(catalog,'search').mockImplementation(async({query})=>[{...item(Number(query)),availability:[]}]);vi.spyOn(catalog,'getTitle').mockImplementation(async(_,id)=>({...item(id),availability:[]}));
 await users.markWatched('alice',item(1));await users.setFeedback('alice','movie',2,'dislike');
 const registry=a.registry();await registry.find(t=>t.name==='resolve_titles')!.execute({titles:[{query:'1',type:'movie',year:null},{query:'2',type:'movie',year:null}]});
 // Fixture query/title differ; seed known identities like an earlier verified result.
 a.known.set('movie:1',{key:'movie:1',id:1,type:'movie',title:'Title 1',year:null});a.known.set('movie:2',{key:'movie:2',id:2,type:'movie',title:'Title 2',year:null});
 const result=await registry.find(t=>t.name==='title_details')!.execute({keys:['movie:1','movie:2'],season:null,episode:null}) as {results:unknown[]};expect(result.results).toHaveLength(2);
});
it('rejects fabricated keys rather than allowing arbitrary private access or a fake card',async()=>{
 const a=adapters();await expect(a.registry().find(t=>t.name==='title_details')!.execute({keys:['movie:999999'],season:null,episode:null})).rejects.toThrow('UNVERIFIED_ENTITY');expect(await a.finish(['movie:999999'])).toEqual([]);
});
it('preserves canonical memory after context expiry but never resurrects an expired write plan',async()=>{
 const memory=assistantMemorySchema.parse({version:1,entities:[],groups:[],request:null,shown:[]});
 await users.setSessionContext('alice',session,{assistantMemory:memory,chatPlan:{id:'expired'}},-1);
 expect(await users.getSessionContext('alice',session)).toEqual({assistantMemory:memory});
 await expect(users.getSessionContext('bob',session)).rejects.toThrow('CONVERSATION_NOT_FOUND');
 await users.clearConversations('alice');expect(await db.select().from(schema.sessionContext)).toEqual([]);
});
it('keeps the exact same transport path for typed text and suggestions and does not call the old router',async()=>{
 vi.spyOn(ai,'mode','get').mockReturnValue('live');const route=vi.spyOn(ai,'routeChat');
 vi.spyOn(ai,'assistantStep').mockResolvedValue({output:[],answer:{text:'Hello, what would you like to know?',cards:[],suggestions:['Tell me about Moneyball']},inputTokens:10,outputTokens:10});
 const chat=new ChatService(users,catalog,ai,epg,{toolAssistant:true});await chat.respond('alice','Hello',session);await chat.respond('alice','Tell me about Moneyball',session);
 expect(route).not.toHaveBeenCalled();expect(ai.assistantStep).toHaveBeenCalledTimes(2);
});
it('does not let the model render an unverified card or claim its fake recommendation is verified',async()=>{
 vi.spyOn(ai,'mode','get').mockReturnValue('live');vi.spyOn(ai,'assistantStep').mockResolvedValue({output:[],answer:{text:'Watch invented film.',cards:['movie:999999'],suggestions:[]},inputTokens:10,outputTokens:10});
 const out=await new ChatService(users,catalog,ai,epg,{toolAssistant:true}).respond('alice','Choose',session);expect(JSON.stringify(out)).not.toContain('invented film');expect(out.blocks.some(b=>b.type==='movie_carousel')).toBe(false);
});
it('does not rerun a write or lose its receipt if the final model request fails',async()=>{
 const step=vi.fn<AssistantStep>().mockResolvedValueOnce({output:[{type:'function_call',name:'prepare_change',arguments:JSON.stringify({kind:'taste'}),call_id:'c'}],answer:null,inputTokens:1,outputTokens:1}).mockRejectedValueOnce(new Error('provider failure'));
 vi.spyOn(ai,'mode','get').mockReturnValue('live');vi.spyOn(ai,'assistantStep').mockImplementation(step);
 vi.spyOn(ai,'extractTaste').mockResolvedValue({mode:'live',summary:'Likes mysteries',signals:[{dimension:'genre',key:'mystery',score:1,confidence:1,evidenceCount:1,source:'chat_explicit'}]});
 const out=await new ChatService(users,catalog,ai,epg,{toolAssistant:true}).respond('alice','I like mystery films',session);
 expect(ai.extractTaste).toHaveBeenCalledTimes(1);expect(out.blocks.some(b=>b.type==='confirmation')).toBe(true);expect((await users.getTaste('alice')).some(s=>s.key==='mystery')).toBe(true);
});
it('never puts another user library into a personal read',async()=>{
 await users.addWatchlist('alice',item(1));await users.addWatchlist('bob',item(2));const a=adapters();const result=await a.registry().find(t=>t.name==='read_profile')!.execute({scope:'watchlist',query:'',offset:0});expect(JSON.stringify(result)).toContain('Title 1');expect(JSON.stringify(result)).not.toContain('Title 2');
 await db.delete(schema.user).where(eq(schema.user.id,'alice'));expect(await db.select().from(schema.sessionContext)).toEqual([]);
});
