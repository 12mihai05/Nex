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
import {localDayWindow} from '../src/services/tv-window.js';
import {localClockTime} from '../src/services/tv-window.js';
import {ChatService} from '../src/services/chat.js';

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
 const day=new Date(Date.now()+2*86400000).toISOString().slice(0,10),window=localDayWindow(day,'Europe/Bucharest'),startAt=new Date(+window.start+20*3600000);
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
