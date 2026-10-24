import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createClient} from '@libsql/client';
import {drizzle} from 'drizzle-orm/libsql';
import {eq} from 'drizzle-orm';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import * as schema from '../src/db/schema.js';
import {UserRepository} from '../src/repositories/user-repository.js';
import {FixtureTmdbRepository} from '../src/repositories/tmdb-repository.js';
import {fixtureCatalog} from '../src/fixtures/catalog.js';
import {AiService} from '../src/services/ai.js';
import {ChatActions} from '../src/services/chat-actions.js';
import {EpgService} from '../src/services/epg/service.js';
import type {ChatActionIntent,ChatActionPlan,TitleChange} from '../src/services/chat-action-types.js';
import {localClockTime} from '../src/services/tv-window.js';
import {ChatService} from '../src/services/chat.js';
import {ChatKnowledge} from '../src/services/chat-knowledge.js';
import {filterQuerySchema} from '../src/domain/types.js';

let client:ReturnType<typeof createClient>,db:ReturnType<typeof drizzle<typeof schema>>,users:UserRepository,session:string,actions:ChatActions,ai:AiService,catalog:FixtureTmdbRepository;
const items=Array.from({length:50},(_,i)=>({...fixtureCatalog[0]!,id:1000+i,title:`Test Film ${i+1}`,year:2000+i%20,mediaType:'movie' as const}));
const change=(i:number,extra:Partial<TitleChange>={}):TitleChange=>({sourceText:items[i]!.title,title:items[i]!.title,year:items[i]!.year,tmdbId:null,mediaType:'movie',position:null,watchlist:'add',seen:'keep',rating:'keep',...extra});
const proposal=(entries:TitleChange[]):ChatActionIntent=>({kind:'library',entries,requestedCount:entries.length,unresolved:[],reminder:null});
const message=(entries:TitleChange[])=>'Add changes: '+entries.map(e=>e.title).join('; ');
async function plan(){return (await users.getSessionContext('alice',session)).chatPlan as ChatActionPlan;}
beforeEach(async()=>{
 client=createClient({url:':memory:'});
 for(const name of (await readdir(fileURLToPath(new URL('../drizzle/',import.meta.url)))).filter(n=>n.endsWith('.sql')).sort())await client.executeMultiple((await readFile(fileURLToPath(new URL(`../drizzle/${name}`,import.meta.url)),'utf8')).replaceAll('--> statement-breakpoint',''));
 db=drizzle(client,{schema});users=new UserRepository(db);
 await db.insert(schema.user).values(['alice','bob'].map(id=>({id,name:id,email:`${id}@example.test`,emailVerified:false,createdAt:new Date(),updatedAt:new Date()})));
 await users.updateSettings('alice',{country:'RO',timezone:'Europe/Bucharest',remindersEnabled:true});
 session=await users.createConversation('alice');ai=new AiService('');catalog=new FixtureTmdbRepository();
 catalog.search=async o=>items.filter(i=>i.title===o.query);
 catalog.getTitle=async(type,id)=>items.find(i=>i.id===id&&i.mediaType===type)??null;
 actions=new ChatActions(users,catalog,ai,new EpgService(db));
});
afterEach(()=>{vi.restoreAllMocks();client.close();});

it('combined planning uses the same guarded recommendation path without a second intent call',async()=>{
 vi.spyOn(ai,'mode','get').mockReturnValue('live');
 const planner=vi.spyOn(ai,'planChat').mockResolvedValue({route:'discovery',reply:'',filter:{...filterQuerySchema.parse({intent:'DISCOVERY',availabilityScope:'all_providers',maxRuntimeMinutes:160}),clarification:null,recommendationMode:'new'}});
 const parser=vi.spyOn(ai,'parseIntent'),router=vi.spyOn(ai,'routeChat');
 vi.spyOn(catalog,'discover').mockResolvedValue(items);
 vi.spyOn(ai,'compose').mockResolvedValue({intro:'Choices.',quickActions:['Other recommendations']});
 const result=await new ChatService(users,catalog,ai,new EpgService(db),{combinedPlanner:true}).respond('alice','Recommend a movie',session);
 expect(planner).toHaveBeenCalledTimes(1);expect(parser).not.toHaveBeenCalled();expect(router).not.toHaveBeenCalled();
 expect(result.blocks.flatMap(b=>b.type==='movie_carousel'?b.items:[])).toHaveLength(8);
 expect((await users.getSessionContext('alice',session)).filter).toMatchObject({maxRuntimeMinutes:160});
 expect(await users.getTaste('alice')).toEqual([]);
});

it('other recommendations exclude every earlier row without crossing sessions or changing Taste',async()=>{
 vi.spyOn(ai,'mode','get').mockReturnValue('live');
 vi.spyOn(ai,'routeChat').mockResolvedValue({route:'discovery',reply:''});
 const parse=vi.spyOn(ai,'parseIntent').mockResolvedValue({...filterQuerySchema.parse({intent:'DISCOVERY',availabilityScope:'all_providers'}),recommendationMode:'new'});
 vi.spyOn(catalog,'discover').mockResolvedValue(items);
 vi.spyOn(ai,'compose').mockResolvedValue({intro:'Choices.',quickActions:['Other recommendations']});
 const chat=new ChatService(users,catalog,ai,new EpgService(db));
 const shown=new Set<string>();
 for(let i=0;i<3;i++){
  const reply=await chat.respond('alice',i?'Other recommendations':'Recommend movies',session);
  const titles=reply.blocks.flatMap(b=>b.type==='movie_carousel'?b.items:[]);
  expect(titles).toHaveLength(8);
  for(const title of titles){const key=`${title.mediaType}:${title.id}`;expect(shown.has(key)).toBe(false);shown.add(key);}
 }
 expect(await users.sessionRecommendationKeys('alice',session)).toEqual(shown);
 await expect(users.sessionRecommendationKeys('bob',session)).rejects.toThrow('CONVERSATION_NOT_FOUND');
 expect(await users.sessionRecommendationKeys('alice',await users.createConversation('alice'))).toEqual(new Set());
 expect(await users.getTaste('alice')).toEqual([]);
 parse.mockResolvedValue({...filterQuerySchema.parse({intent:'DISCOVERY',availabilityScope:'all_providers'}),recommendationMode:'repeat'});
 vi.mocked(catalog.discover).mockResolvedValue(items.filter(i=>shown.has(`${i.mediaType}:${i.id}`)));
 const repeated=await chat.respond('alice','Show those again',session);
 expect(repeated.blocks.flatMap(b=>b.type==='movie_carousel'?b.items:[]).some(i=>shown.has(`${i.mediaType}:${i.id}`))).toBe(true);
 const lookup=items.find(i=>shown.has(`${i.mediaType}:${i.id}`))!;
 parse.mockResolvedValue(filterQuerySchema.parse({intent:'TITLE_LOOKUP',query:lookup.title,availabilityScope:'all_providers'}));
 expect((await chat.respond('alice',lookup.title,session)).blocks.flatMap(b=>b.type==='movie_carousel'?b.items:[]).map(i=>i.id)).toContain(lookup.id);
 vi.spyOn(catalog,'discover').mockResolvedValue([]);
 parse.mockResolvedValue({...filterQuerySchema.parse({intent:'DISCOVERY',availabilityScope:'all_providers'}),recommendationMode:'new'});
 expect((await chat.respond('alice','More',session)).blocks.some(b=>b.type==='empty_state'&&b.message.includes('without repeating'))).toBe(true);
});

it('passes the discussed film and feeling to retrieval and editorial review, not only the router',async()=>{
 vi.spyOn(ai,'mode','get').mockReturnValue('live');
 vi.spyOn(ai,'routeChat').mockResolvedValue({route:'discovery',reply:''});
 await users.addConversationMessage('alice',session,'user','Describe The Perks of Being a Wallflower');
 await users.addConversationMessage('alice',session,'assistant','An intimate, bittersweet story of belonging and friendship.');
 const parse=vi.spyOn(ai,'parseIntent').mockResolvedValue(filterQuerySchema.parse({intent:'DISCOVERY',similarTo:'The Perks of Being a Wallflower',availabilityScope:'all_providers'}));
 vi.spyOn(catalog,'search').mockResolvedValue([{...fixtureCatalog[0]!,title:'The Perks of Being a Wallflower'}]);
 const compose=vi.spyOn(ai,'compose').mockResolvedValue({intro:'No verified match.',quickActions:[],selectedKeys:[]});
 const result=await new ChatService(users,catalog,ai,new EpgService(db)).respond('alice','Give me recommendations with the same feeling',session);
 expect(parse.mock.calls[0]![2]?.history.some(m=>m.content.includes('Wallflower'))).toBe(true);
 expect(compose.mock.calls[0]![2]).toBe(true);
 expect(compose.mock.calls[0]![4]?.history.some(m=>m.content.includes('bittersweet'))).toBe(true);
 expect(result.blocks.some(b=>b.type==='movie_carousel')).toBe(false);
 expect(await users.getTaste('alice')).toEqual([]);
});

it('does not show unrelated cards when intent is ambiguous or its live parser fails',async()=>{
 vi.spyOn(ai,'mode','get').mockReturnValue('live');
 vi.spyOn(ai,'routeChat').mockResolvedValue({route:'discovery',reply:''});
 const parse=vi.spyOn(ai,'parseIntent').mockResolvedValue({...filterQuerySchema.parse({intent:'DISCOVERY'}),clarification:'Which of the two movies do you mean?'});
 const compose=vi.spyOn(ai,'compose');
 const chat=new ChatService(users,catalog,ai,new EpgService(db));
 expect((await chat.respond('alice','More like that',session)).blocks.map(b=>b.type)).toEqual(['text']);
 parse.mockRejectedValue(Error('Unavailable'));
 expect((await chat.respond('alice','More like that',session)).blocks.map(b=>b.type)).toEqual(['text']);
 expect(compose).not.toHaveBeenCalled();
});

it('does not turn confusion after a failed preference extraction into a write',async()=>{
 vi.spyOn(ai,'mode','get').mockReturnValue('live');
 const route=vi.spyOn(ai,'routeChat').mockResolvedValueOnce({route:'preference',reply:''}).mockResolvedValueOnce({route:'conversation',reply:'I meant whether international co-productions should stay available. Nothing changed.'});
 const extract=vi.spyOn(ai,'extractTaste').mockResolvedValue({summary:'',signals:[],mode:'live'});
 const chat=new ChatService(users,catalog,ai,new EpgService(db));
 await chat.respond('alice','Yes coproductions remain eligible',session);
 const answer=await chat.respond('alice','What',session);
 expect(route).toHaveBeenCalledTimes(2);expect(extract).toHaveBeenCalledTimes(1);
 expect(answer.blocks.map(b=>b.type)).toEqual(['text']);expect(await users.getTaste('alice')).toEqual([]);
});

it('AI routing understands a Taste clarification across turns and persists co-production scope, not a carousel',async()=>{
 vi.spyOn(ai,'mode','get').mockReturnValue('live');
 const route=vi.spyOn(ai,'routeChat').mockResolvedValue({route:'preference',reply:''});
 const question='Should I also exclude co-productions with countries outside that group?';
 const request='exclude form my feed asian mvoies like japanese korean chinese but not russian';
 const extract=vi.spyOn(ai,'extractTaste').mockResolvedValueOnce({summary:'',signals:[],mode:'live',clarification:question}).mockResolvedValueOnce({summary:'',mode:'live',signals:[{dimension:'combination',key:'Asian productions except Russia',score:-1,confidence:1,evidenceCount:1,source:'onboarding_text',exclude:true,statement:request,conditions:[{dimension:'country',values:['JP','KR','CN'],match:'only'},{dimension:'format',values:['movie','series']}]}]});
 const parse=vi.spyOn(ai,'parseIntent');
 const chat=new ChatService(users,catalog,ai,new EpgService(db));
 expect((await chat.respond('alice',request,session)).blocks.map(b=>b.type)).toEqual(['text']);
 expect(await users.getTaste('alice')).toHaveLength(0);
 const answer=await chat.respond('alice','no',session);
 expect(answer.blocks.map(b=>b.type)).toEqual(['confirmation']);expect(parse).not.toHaveBeenCalled();
 expect(extract.mock.calls[1]![0]).toContain('User answer: no');
 expect(route.mock.calls[1]![1].some(m=>m.content.includes(question))).toBe(true);
 const taste=await users.getTaste('alice');expect(taste[0]).toMatchObject({exclude:true,conditions:[{dimension:'country',match:'only'},{}]});
 expect(await users.getTaste('bob')).toEqual([]);
 await expect(users.recentConversationMessages('bob',session)).rejects.toThrow('CONVERSATION_NOT_FOUND');
});

it('casual conversation and off-topic requests cannot fall through into movies or profile writes',async()=>{
 vi.spyOn(ai,'mode','get').mockReturnValue('live');
 const route=vi.spyOn(ai,'routeChat');
 const extract=vi.spyOn(ai,'extractTaste'),parse=vi.spyOn(ai,'parseIntent'),mutate=vi.spyOn(users,'upsertTaste');
 const chat=new ChatService(users,catalog,ai,new EpgService(db));
 for(const kind of ['conversation','out_of_scope'] as const){
   route.mockResolvedValue({route:kind,reply:'A natural response, without movie cards.'});
   expect((await chat.respond('alice','A user message',session)).blocks.map(b=>b.type)).toEqual(['text']);
 }
 expect(extract).not.toHaveBeenCalled();expect(parse).not.toHaveBeenCalled();expect(mutate).not.toHaveBeenCalled();
 route.mockRejectedValue(Error('Unavailable'));
 expect(JSON.stringify(await chat.respond('alice','Something',session))).toContain('Nothing changed');
 expect(parse).not.toHaveBeenCalled();
});

it('updates a repeated combination statement instead of duplicating its reworded label',async()=>{
 vi.spyOn(ai,'mode','get').mockReturnValue('live');vi.spyOn(ai,'routeChat').mockResolvedValue({route:'preference',reply:''});
 const statement='Exclude Japanese films, allow co-productions.';
 const signal={dimension:'combination',key:'Japanese films',score:-1,confidence:1,evidenceCount:1,source:'chat_explicit',statement,exclude:true,conditions:[{dimension:'country' as const,values:['JP'],match:'only' as const},{dimension:'format' as const,values:['movie']}]};
 await users.upsertTaste('alice',[signal]);
 vi.spyOn(ai,'extractTaste').mockResolvedValue({summary:'',mode:'live',signals:[{...signal,key:'Japanese productions'}]});
 await new ChatService(users,catalog,ai,new EpgService(db)).respond('alice',statement,session);
 const taste=await users.getTaste('alice');expect(taste).toHaveLength(1);expect(taste[0]!.key).toBe('japanese films');
});

it('quota-exempt confirmation protocol never invokes the AI router',async()=>{
 vi.spyOn(ai,'mode','get').mockReturnValue('live');
 const route=vi.spyOn(ai,'routeChat'),extract=vi.spyOn(ai,'extractTaste');
 await new ChatService(users,catalog,ai,new EpgService(db)).respond('alice','Cancel changes',session);
 expect(route).not.toHaveBeenCalled();expect(extract).not.toHaveBeenCalled();
});

it('keeps ordinal card references distinct from the focused person',async()=>{
 const id=await users.addConversationMessage('alice',session,'assistant','Cards');
 await users.saveDisplayedItems('alice',session,id,items.slice(0,2));
 await users.setSessionContext('alice',session,{focus:{type:'person',id:'77',source:'tmdb',title:'Test Director'}});
 const facts=vi.fn().mockResolvedValue({overview:'Verified synopsis'});
 const knowledge=new ChatKnowledge(users,{...catalog,knowledge:facts} as unknown as FixtureTmdbRepository,ai,new EpgService(db));
 const answer=vi.spyOn(ai,'answerKnowledge').mockResolvedValue({type:'knowledge',content:'Verified synopsis',citations:[]});
 await knowledge.handle('alice',session,'Tell me more about the first movie');
 expect(facts).toHaveBeenCalledWith('movie',items[0]!.id);expect(answer).toHaveBeenCalled();
});

it('reuses a verified series identity for episode questions without a new title search',async()=>{
 await users.setSessionContext('alice',session,{focus:{type:'series',id:'1399',source:'tmdb',title:'Game of Thrones'}});
 const episode=vi.fn().mockResolvedValue({id:63056,name:'Winter Is Coming',crew:[{id:196,job:'Director',name:'Tim Van Patten'}]});
 const catalogWithEpisodes=Object.assign(catalog,{episodeKnowledge:episode,season:vi.fn().mockResolvedValue({episodes:[]})});
 const subject=vi.spyOn(ai,'knowledgeSubject');vi.spyOn(ai,'answerKnowledge').mockResolvedValue({type:'knowledge',content:'Tim Van Patten directed it.',citations:[]});
 await new ChatKnowledge(users,catalogWithEpisodes,ai,new EpgService(db)).handle('alice',session,'Who directed season 1 episode 1?');
 expect(episode).toHaveBeenCalledWith(1399,1,1);expect(subject).not.toHaveBeenCalled();
 expect((await users.getSessionContext('alice',session)).focus).toMatchObject({type:'person',id:'196'});
});

it('asks before an ambiguous singular action and uses the focused movie when unambiguous',async()=>{
 const id=await users.addConversationMessage('alice',session,'assistant','Cards');
 await users.saveDisplayedItems('alice',session,id,items.slice(0,2));
 const parse=vi.spyOn(ai,'parseActions').mockResolvedValue(proposal([change(1,{position:1})]));
 expect(JSON.stringify(await actions.handle('alice',session,'Add this to my watchlist'))).toContain('Which one');
 expect(parse).not.toHaveBeenCalled();expect(await plan()).toBeUndefined();
 const context=await users.getSessionContext('alice',session);
 await users.setSessionContext('alice',session,{...context,focus:{type:'movie',id:String(items[1]!.id),title:items[1]!.title,source:'tmdb'}});
 await actions.handle('alice',session,'Add this to my watchlist');
 expect((await plan()).entries[0]!.item.id).toBe(items[1]!.id);
 expect(await users.listWatchlist('alice')).toHaveLength(0);
});

it('includes library preview cards in the active conversation without applying changes',async()=>{
 vi.spyOn(ai,'parseActions').mockResolvedValue(proposal([change(0),change(1)]));
 await new ChatService(users,catalog,ai,new EpgService(db)).respond('alice','Add Test Film 1 and Test Film 2 to my watchlist',session);
 expect((await users.recentDisplayedItems('alice',session)).map(r=>r.externalId)).toEqual([String(items[0]!.id),String(items[1]!.id)]);
 expect(await users.listWatchlist('alice')).toHaveLength(0);
});

it('retains a foreign broadcast country and day for a this-card reminder',async()=>{
 const startAt=new Date(Date.now()+3*86400000);
 await db.insert(schema.channels).values({id:'uk',sourceId:'test',externalId:'uk',displayName:'UK Channel',country:'GB'});
 await db.insert(schema.epgPrograms).values({id:'uk-airing',sourceId:'test',sourceProgramId:'uk-airing',channelId:'uk',title:'Future programme',startAt,endAt:new Date(+startAt+3600000)});
 const id=await users.addConversationMessage('alice',session,'assistant','TV');
 await users.saveDisplayedReferences('alice',session,id,[{contentType:'liveEvent',externalId:'uk-airing',metadata:{title:'Future programme',country:'GB',startsAt:startAt.toISOString()}}]);
 const context=await users.getSessionContext('alice',session);
 await users.setSessionContext('alice',session,{...context,focus:{type:'broadcast',source:'epg',id:'uk-airing',title:'Future programme',country:'GB',startsAt:startAt.toISOString()}});
 vi.spyOn(ai,'parseActions').mockResolvedValue({kind:'reminder',entries:[],requestedCount:1,unresolved:[],reminder:{title:'',channel:'',date:new Date().toISOString().slice(0,10),localTime:null,offsetMinutes:15,country:null,position:1}});
 await actions.handle('alice',session,'Remind me 15 minutes before this');
 expect(await plan()).toMatchObject({country:'GB',timezone:'Europe/London',reminder:{id:'uk-airing',startAt:startAt.toISOString(),offsetMinutes:15}});
 expect(await users.listReminders('alice')).toHaveLength(0);
});

it('routes contracted dislikes to durable taste, persists them and confirms their actual meaning',async()=>{
 const extract=vi.spyOn(ai,'extractTaste').mockResolvedValue({summary:'Dislikes',mode:'live',signals:[{dimension:'language',key:'ko',score:-.9,confidence:.9,evidenceCount:1,source:'onboarding_text'}]});
 const parse=vi.spyOn(ai,'parseIntent');
 const reply=await new ChatService(users,catalog,ai,new EpgService(db)).respond('alice',"I don't like kpop kdrama or Korean movies and series.",session);
 expect(extract).toHaveBeenCalled();expect(parse).not.toHaveBeenCalled();
 expect(reply.blocks[0]?.type).toBe('confirmation');expect(JSON.stringify(reply.blocks)).toContain('Korean-language titles');
 expect(await users.getTaste('alice')).toEqual([expect.objectContaining({dimension:'language',key:'ko',score:-.9,source:'chat_explicit'})]);
});

it('keeps Antena 1 broadcast context across named and pronoun follow-ups, including midnight',async()=>{
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const at=localClockTime(day,20,0,'Europe/Bucharest');
 await db.insert(schema.channels).values([{id:'antena',sourceId:'test',externalId:'antena',displayName:'Antena 1',country:'RO'},{id:'other',sourceId:'test',externalId:'other',displayName:'Other',country:'RO'}]);
 await db.insert(schema.epgPrograms).values([
  {id:'obs',title:'Observator',startAt:new Date(+at-3600000),endAt:new Date(+at+1800000),channelId:'antena'},
  {id:'next',title:'Next show',startAt:new Date(+at+1800000),endAt:new Date(+at+4*3600000),channelId:'antena'},
  {id:'midnight',title:'Midnight show',startAt:new Date(+at+4*3600000),endAt:new Date(+at+5*3600000),channelId:'antena'},
  {id:'wrong',title:'Wrong channel',startAt:new Date(+at+1800000),endAt:new Date(+at+3600000),channelId:'other'},
 ].map(p=>({...p,sourceId:'test',sourceProgramId:p.id})));
 const chat=new ChatService(users,catalog,ai,new EpgService(db));
 const ids=(r:Awaited<ReturnType<ChatService['respond']>>)=>r.blocks.flatMap(b=>b.type==='tv_carousel'?b.items.map(p=>p.id):[]);
 expect(ids(await chat.respond('alice','what is on antena 1 around 8pm tonight',session))).toEqual(['obs']);
 expect(ids(await chat.respond('alice','after observator what will be',session))).toEqual(['next']);
 expect(ids(await chat.respond('alice','and after that?',session))).toEqual(['midnight']);
 const missing=await chat.respond('alice','what comes next?',session);expect(ids(missing)).toEqual([]);expect(JSON.stringify(missing)).toContain('No next listing');
 const fresh=await users.createConversation('alice');expect(ids(await chat.respond('alice','after Observator?',fresh))).toEqual([]);
 await chat.respond('alice','what is on antena 1 around 8pm tonight',session);
 await db.delete(schema.epgPrograms).where(eq(schema.epgPrograms.id,'obs'));
 expect(JSON.stringify(await chat.respond('alice','after that?',session))).toContain('changed or expired');
});

it('clear chat cascades private messages/references/plans without touching another user or saved taste/library',async()=>{
 const bob=await users.createConversation('bob');await users.addConversationMessage('bob',bob,'user','Keep this');
 const id=await users.addConversationMessage('alice',session,'assistant','Private');await users.saveDisplayedItems('alice',session,id,[items[0]!]);
 await users.setSessionContext('alice',session,{chatPlan:{id:'pending'},tv:{programs:[]}});
 await users.addWatchlist('alice',items[0]!);await users.markWatched('alice',items[0]!);await users.applyFeedback('alice',items[0]!,'like');
 const taste=await users.getTaste('alice');
 await users.clearConversations('alice');await users.clearConversations('alice');
 expect(await users.assertConversation('alice',session)).toBe(false);expect(await users.assertConversation('bob',bob)).toBe(true);
 expect(await db.select().from(schema.conversationDisplayedItems)).toHaveLength(0);expect(await db.select().from(schema.sessionContext)).toHaveLength(0);
 expect((await db.select().from(schema.conversationMessages)).map(m=>m.sessionId)).toEqual([bob]);
 expect(await users.listWatchlist('alice')).toHaveLength(1);expect(await users.listHistory('alice')).toHaveLength(1);expect(await users.listFeedback('alice')).toHaveLength(1);
 expect((await users.getTaste('alice')).map(t=>t.key)).toEqual(taste.map(t=>t.key));
 await expect(users.getSessionContext('alice',session)).rejects.toThrow('CONVERSATION_NOT_FOUND');
});

it('answers a channel/time query with only overlapping shows from that channel, not the global first page',async()=>{
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const at=localClockTime(date,20,0,'Europe/Bucharest');
 await db.insert(schema.channels).values([{id:'pro',sourceId:'test',externalId:'pro',displayName:'Pro TV',country:'RO'},{id:'other',sourceId:'test',externalId:'other',displayName:'Other Channel',country:'RO'},{id:'foreign',sourceId:'test',externalId:'foreign',displayName:'Pro TV',country:'GB'}]);
 await db.insert(schema.epgPrograms).values([
  ...Array.from({length:110},(_,i)=>({id:`noise-${i}`,sourceId:'test',sourceProgramId:`noise-${i}`,channelId:'other',title:`Unrelated ${i}`,startAt:new Date(+at-3600000),endAt:new Date(+at+3600000)})),
  {id:'right',sourceId:'test',sourceProgramId:'right',channelId:'pro',title:'Correct broadcast',startAt:new Date(+at-1800000),endAt:new Date(+at+3600000)},
  {id:'earlier',sourceId:'test',sourceProgramId:'earlier',channelId:'pro',title:'Already ended',startAt:new Date(+at-7200000),endAt:at},
  {id:'wrong-country',sourceId:'test',sourceProgramId:'wrong-country',channelId:'foreign',title:'Wrong country',startAt:new Date(+at-1800000),endAt:new Date(+at+3600000)},
 ]);
 const parse=vi.spyOn(ai,'parseIntent');
 const chat=new ChatService(users,catalog,ai,new EpgService(db));
 const response=await chat.respond('alice','what is today at 8pm on protv',session);
 const carousel=response.blocks.find(b=>b.type==='tv_carousel');expect(carousel?.items.map(i=>i.id)).toEqual(['right']);expect(parse).not.toHaveBeenCalled();
 const missing=await chat.respond('alice','What is today at 8pm on MissingTV?',session);expect(missing.blocks.some(b=>b.type==='tv_carousel')).toBe(false);
});

it('answers taste capability questions without inventing limitations or saving preferences',async()=>{
 const extract=vi.spyOn(ai,'extractTaste');
 const reply=await new ChatService(users,catalog,ai,new EpgService(db)).respond('alice','if i tell you in here what i like and what not will you be able to change my taste?',session);
 expect(JSON.stringify(reply.blocks)).toContain('Yes.');expect(extract).not.toHaveBeenCalled();expect(await users.getTaste('alice')).toHaveLength(0);
});

it('previews and atomically applies 50 mixed titles, keeping Seen and ratings independent and receipts idempotent',async()=>{
 const entries=items.map((_,i)=>change(i,{seen:i%3===0?'seen':'keep',rating:i%3===1?'like':'keep'}));
 vi.spyOn(ai,'parseActions').mockResolvedValue(proposal(entries));
 const preview=await actions.handle('alice',session,message(entries));
 expect(JSON.stringify(preview)).toContain('50 titles');expect(await users.listWatchlist('alice')).toHaveLength(0);
 expect(preview?.find(b=>b.type==='library_changes')).toMatchObject({status:'preview',items:expect.arrayContaining([expect.objectContaining({title:'Test Film 1',changes:['add to Want to see','mark Seen']})])});
 const p=await plan();const result=await actions.handle('alice',session,`Confirm changes ${p.id}`);
 expect(JSON.stringify(result)).toContain('Saved 50 of 50');
 expect(await users.listWatchlist('alice')).toHaveLength(50);expect(await users.listHistory('alice')).toHaveLength(17);expect(await users.listFeedback('alice')).toHaveLength(17);
 const count=(await db.select().from(schema.userEvents)).length;
 expect(await actions.handle('alice',session,`Confirm changes ${p.id}`)).toEqual(result);
 expect((await db.select().from(schema.userEvents)).length).toBe(count);
 expect((await users.getTaste('alice')).some(t=>t.score>0)).toBe(true);
});

it('rolls back a mid-batch failure and can retry the same proposal without losing entries',async()=>{
 const entries=[change(0),change(1,{seen:'seen'})];vi.spyOn(ai,'parseActions').mockResolvedValue(proposal(entries));
 await actions.handle('alice',session,message(entries));const p=await plan();
 const failure=vi.spyOn(UserRepository.prototype,'markWatched').mockRejectedValueOnce(new Error('TEST_FAILURE'));
 expect(JSON.stringify(await actions.handle('alice',session,`Confirm changes ${p.id}`))).toContain('couldn’t confirm');
 expect(await users.listWatchlist('alice')).toHaveLength(0);expect(await users.listHistory('alice')).toHaveLength(0);
 failure.mockRestore();await actions.handle('alice',session,`Confirm changes ${p.id}`);
 expect(await users.listWatchlist('alice')).toHaveLength(2);expect(await users.listHistory('alice')).toHaveLength(1);
});

it('rejects ambiguous, invented, incomplete and duplicate title lists without a partial proposal',async()=>{
 const parse=vi.spyOn(ai,'parseActions');
 for(const entries of [[change(0),change(0)],[change(0),change(1,{title:'Invented Title'})]]){
   parse.mockResolvedValue(proposal(entries));await actions.handle('alice',session,'Add Test Film 1 and Test Film 2');expect(await plan()).toBeUndefined();
 }
 parse.mockResolvedValue({...proposal([change(0)]),requestedCount:2});await actions.handle('alice',session,'Add Test Film 1 and Test Film 2');expect(await plan()).toBeUndefined();
 catalog.search=async()=>[items[0]!,{...items[0]!,id:99,year:1980}];parse.mockResolvedValue(proposal([change(0,{year:null})]));
 expect(JSON.stringify(await actions.handle('alice',session,'Add Test Film 1'))).toContain('ambiguous');expect(await plan()).toBeUndefined();
 expect(await users.listWatchlist('alice')).toHaveLength(0);
});

it('scope checks prevent cross-user, stale, cancelled or expired proposals from writing',async()=>{
 vi.spyOn(ai,'parseActions').mockResolvedValue(proposal([change(0)]));await actions.handle('alice',session,'Add Test Film 1');let p=await plan();
 await expect(users.commitChatPlan('bob',session,p.id)).rejects.toThrow();
 expect(await users.listWatchlist('alice')).toHaveLength(0);
 await actions.handle('alice',session,`Cancel changes ${p.id}`);await actions.handle('alice',session,`Confirm changes ${p.id}`);expect(await users.listWatchlist('alice')).toHaveLength(0);
 await actions.handle('alice',session,'Add Test Film 1');p=await plan();await users.setSessionContext('alice',session,{chatPlan:{...p,expiresAt:Date.now()-1}});
 await actions.handle('alice',session,`Confirm changes ${p.id}`);expect(await users.listWatchlist('alice')).toHaveLength(0);
});

it('bulk ratings produce the same taste as individual feedback and clearing does not remove Seen',async()=>{
 const entries=[change(0,{seen:'seen',rating:'super_like'}),change(1,{rating:'dislike'})];vi.spyOn(ai,'parseActions').mockResolvedValue(proposal(entries));
 await actions.handle('alice',session,message(entries));await users.commitChatPlan('alice',session,(await plan()).id);
 await users.applyFeedback('bob',items[0]!,'super_like');await users.applyFeedback('bob',items[1]!,'dislike');
 const compact=async(id:string)=>(await users.getTaste(id)).map(t=>({dimension:t.dimension,key:t.key,score:t.score,confidence:t.confidence,evidenceCount:t.evidenceCount})).sort((a,b)=>(a.dimension+a.key).localeCompare(b.dimension+b.key));
 expect(await compact('alice')).toEqual(await compact('bob'));
 vi.spyOn(ai,'parseActions').mockResolvedValue(proposal([change(0,{watchlist:'keep',rating:'clear'})]));
 await actions.handle('alice',session,'Clear Test Film 1 rating');await users.commitChatPlan('alice',session,(await plan()).id);
 expect(await users.listHistory('alice')).toHaveLength(1);expect(await users.listFeedback('alice')).toHaveLength(1);
});

it('matches non-favorite EPG by country/channel/day, uses actual time, and rejects a changed schedule',async()=>{
 const day=new Date(Date.now()+2*86400000).toISOString().slice(0,10),startAt=localClockTime(day,20,0,'Europe/Bucharest');
 await db.insert(schema.channels).values({id:'protv',sourceId:'test',externalId:'protv',displayName:'Pro TV',country:'RO'});
 await db.insert(schema.epgPrograms).values({id:'airing',sourceId:'test',sourceProgramId:'airing',channelId:'protv',title:'Test Film 1',startAt,endAt:new Date(+startAt+7200000)});
 await db.insert(schema.epgPrograms).values({id:'later-airing',sourceId:'test',sourceProgramId:'later-airing',channelId:'protv',title:'Test Film 1',startAt:new Date(+startAt+3600000),endAt:new Date(+startAt+10800000)});
 vi.spyOn(ai,'parseActions').mockResolvedValue({kind:'reminder',entries:[],requestedCount:1,unresolved:[],reminder:{title:'Test Film 1',channel:'protv',date:day,localTime:'20:00',offsetMinutes:15,country:null,position:null}});
 await actions.handle('alice',session,'Remind me 15 minutes before Test Film 1 on protv');let p=await plan();expect(p.reminder?.startAt).toBe(startAt.toISOString());
 const blocks=await users.commitChatPlan('alice',session,p.id);expect(blocks[0]).toMatchObject({type:'confirmation',action:{channelName:'Pro TV',offsetMinutes:15}});
 expect(+(await users.listReminders('alice'))[0]!.notifyAt).toBe(+startAt-15*60000);
 await users.deleteReminder('alice',(await users.listReminders('alice'))[0]!.id);
 await expect(users.commitChatPlan('alice',session,p.id)).rejects.toThrow('REMINDER_RECEIPT_STALE');
 await actions.handle('alice',session,'Remind me 15 minutes before Test Film 1 on protv');p=await plan();
 await db.update(schema.epgPrograms).set({startAt:new Date(+startAt+60000)}).where(eq(schema.epgPrograms.id,'airing'));
 await expect(users.commitChatPlan('alice',session,p.id)).rejects.toThrow('EPG_CHANGED');
});

it('independently rejects an omitted title from a declared line inventory',async()=>{
 vi.spyOn(ai,'parseActions').mockResolvedValue(proposal([change(0)]));
 const result=await actions.handle('alice',session,'Add these movies. One title per line:\nTest Film 1\nTest Film 2');
 expect(JSON.stringify(result)).toContain('at least one line was missing');expect(await plan()).toBeUndefined();
});

it('no action interpretation or unavailable AI makes no library writes',async()=>{
 vi.spyOn(ai,'parseActions').mockResolvedValue({kind:'none',entries:[],requestedCount:0,unresolved:[],reminder:null});
 expect(await actions.handle('alice',session,'Do not add anything to my watchlist')).toBeNull();
 vi.spyOn(ai,'parseActions').mockRejectedValue(new Error('offline'));expect(JSON.stringify(await actions.handle('alice',session,'Add Test Film 1'))).toContain('Nothing was changed');
 expect(await users.listWatchlist('alice')).toHaveLength(0);
});

it('accepts explicit TMDB identifiers but rejects invented IDs and mismatched metadata',async()=>{
 const parse=vi.spyOn(ai,'parseActions');
 const sourceText='Test Film 1 (2000, movie, TMDB ID 1000)';
 parse.mockResolvedValue(proposal([change(0,{tmdbId:1000,sourceText})]));
 await actions.handle('alice',session,`Add ${sourceText}`);expect((await plan()).entries[0]!.item.id).toBe(1000);
 await actions.handle('alice',session,'Add Test Film 1');expect(await plan()).toBeUndefined();
 parse.mockResolvedValue(proposal([change(0,{tmdbId:1000,sourceText,year:1980})]));
 await actions.handle('alice',session,`Add ${sourceText}`);expect(await plan()).toBeUndefined();
});
