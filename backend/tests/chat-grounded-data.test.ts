import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createClient} from '@libsql/client';
import {drizzle} from 'drizzle-orm/libsql';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import * as schema from '../src/db/schema.js';
import {UserRepository} from '../src/repositories/user-repository.js';
import {FixtureTmdbRepository} from '../src/repositories/tmdb-repository.js';
import {AiService} from '../src/services/ai.js';
import {EpgService} from '../src/services/epg/service.js';
import {ChatService} from '../src/services/chat.js';
import {isOffAir,shortlistTv} from '../src/services/tv-selection.js';
import type {TvPlan} from '../src/services/tv-plan.js';
import {ChatReleases} from '../src/services/chat-releases.js';
import type {TasteEditPlan} from '../src/services/chat-taste-edit.js';
import {ChatKnowledge} from '../src/services/chat-knowledge.js';

let client:ReturnType<typeof createClient>,db:ReturnType<typeof drizzle<typeof schema>>,users:UserRepository,session:string,ai:AiService,epg:EpgService,catalog:FixtureTmdbRepository,chat:ChatService;
const plan=(extra:Partial<TvPlan>={}):TvPlan=>({mode:'schedule',pagination:'first_page',country:null,channelIds:['ppv2'],window:'live',date:null,time:null,anchorId:null,title:null,year:null,goal:'',clarification:null,...extra});
beforeEach(async()=>{
 client=createClient({url:':memory:'});
 const dir=fileURLToPath(new URL('../drizzle/',import.meta.url));
 for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())await client.executeMultiple((await readFile(dir+'/'+name,'utf8')).replaceAll('--> statement-breakpoint',''));
 db=drizzle(client,{schema});users=new UserRepository(db);ai=new AiService('');epg=new EpgService(db);catalog=new FixtureTmdbRepository();
 await db.insert(schema.user).values(['alice','bob'].map(id=>({id,name:id,email:id+'@example.test'})));
 await users.updateSettings('alice',{country:'RO',timezone:'Europe/Bucharest'});
 session=await users.createConversation('alice');chat=new ChatService(users,catalog,ai,epg);
 vi.spyOn(ai,'mode','get').mockReturnValue('live');vi.spyOn(ai,'routeChat').mockResolvedValue({route:'tv',reply:''});
 await db.insert(schema.channels).values(['ppv1','ppv2'].map(id=>({id,sourceId:'fixture',externalId:id,displayName:'Prima Sport '+id.toUpperCase(),country:'RO'})));
 const now=Date.now();
 await db.insert(schema.epgPrograms).values([
  {id:'off',sourceId:'fixture',sourceProgramId:'off',channelId:'ppv2',title:'Fără Emisie',startAt:new Date(now-3600000),endAt:new Date(now+3600000)},
  {id:'next',sourceId:'fixture',sourceProgramId:'next',channelId:'ppv2',title:'Tennis final',startAt:new Date(now+3600000),endAt:new Date(now+7200000)},
  {id:'other',sourceId:'fixture',sourceProgramId:'other',channelId:'ppv1',title:'Football',startAt:new Date(now-3600000),endAt:new Date(now+7200000)},
 ]);
});
afterEach(()=>{vi.restoreAllMocks();client.close();});
it('answers off-air factually and follows yes to the next programme on the same channel',async()=>{
 const planner=vi.spyOn(ai,'planTv').mockResolvedValue(plan());
 const first=await chat.respond('alice','What is on PPV2?',session);
 expect(JSON.stringify(first.blocks)).toContain('off air');
 planner.mockResolvedValue(plan({mode:'next',anchorId:'off'}));
 const next=await chat.respond('alice','Yes, what follows that?',session);
 expect(next.blocks.flatMap(b=>b.type==='tv_carousel'?b.items.map(p=>p.id):[])).toEqual(['next']);
 expect(next.blocks.some(b=>b.type==='movie_carousel'||b.type==='quick_actions')).toBe(false);
 expect(planner.mock.calls[1]?.[2]).toMatchObject({tv:{country:'RO',programs:[{id:'off'}]}});
});
it('does not invent a next programme or substitute another channel when source has a gap',async()=>{
 vi.spyOn(ai,'planTv').mockResolvedValue(plan({mode:'next',anchorId:'next'}));
 const row=(await epg.listWindow(new Date(),new Date(Date.now()+86400000),'RO','alice')).find(p=>p.id==='next')!;
 await users.setSessionContext('alice',session,{tv:{country:'RO',programs:[{id:row.id,title:row.title,startAt:row.startAt.toISOString()}]}});
 const result=await chat.respond('alice','What comes after tennis?',session);
 expect(result.blocks.flatMap(b=>b.type==='tv_carousel'?b.items:[])).toEqual([]);
 expect(JSON.stringify(result.blocks)).toContain('no next programme');
});
it('filters off-air recommendations and rejects a model ID not present in verified listings',async()=>{
 vi.spyOn(ai,'planTv').mockResolvedValue(plan({mode:'recommend',channelIds:[]}));
 const selector=vi.spyOn(ai,'selectTv').mockResolvedValue({intro:'Options',ids:['invented']});
 const result=await chat.respond('alice','What is good now?',session);
 expect(selector.mock.calls[0]?.[2].map(p=>p.id)).toEqual(['other']);
 expect(result.blocks.some(b=>b.type==='tv_carousel')).toBe(false);
 expect(JSON.stringify(result.blocks)).toContain('couldn’t verify');
});
it('uses the same title broadcast lookup as detail pages',async()=>{
 const title=(await catalog.search({query:'',region:'RO'}))[0]!;
 vi.spyOn(catalog,'search').mockResolvedValue([title]);
 vi.spyOn(ai,'planTv').mockResolvedValue(plan({mode:'title_airings',title:title.title,channelIds:[]}));
 const lookup=vi.spyOn(epg,'broadcastsForTitle').mockResolvedValue([]);
 const result=await chat.respond('alice',`Will ${title.title} be on TV?`,session);
 expect(lookup).toHaveBeenCalledWith(title,'RO',expect.any(Date));
 expect(JSON.stringify(result.blocks)).toContain('isn’t a guarantee');
});
it('searches all channels across an explicit rolling window, without off-air or later listings',async()=>{
 const now=Date.now();
 await db.insert(schema.epgPrograms).values({id:'late',sourceId:'fixture',sourceProgramId:'late',channelId:'ppv2',title:'Later film',startAt:new Date(now+4*3600000),endAt:new Date(now+5*3600000)});
 vi.spyOn(ai,'planTv').mockResolvedValue(plan({mode:'recommend',channelIds:[],horizonHours:3}));
 const selector=vi.spyOn(ai,'selectTv').mockResolvedValue({intro:'Some options',ids:['next','other']});
 const out=await chat.respond('alice','What is good in the next three hours?',session);
 expect(selector.mock.calls[0]?.[2].map(p=>p.id).sort()).toEqual(['next','other']);
 expect(out.blocks.flatMap(b=>b.type==='tv_carousel'?b.items.map(p=>p.id):[])).toEqual(['next','other']);
});
it.each(['same','foreign','conflict','explicit'])('resolves broadcast follow-up years conservatively: %s',async mode=>{
 const title={...(await catalog.search({query:'',region:'RO'}))[0]!,title:'Same name',originalTitle:'Same name',year:2011};
 const other={...title,id:title.id+1,mediaType:'series' as const,year:2021};
 vi.spyOn(catalog,'search').mockResolvedValue([title,other]);
 await users.setSessionContext('alice',session,{tv:{country:mode==='foreign'?'GB':'RO',programs:[{title:title.title,year:2011},...(mode==='conflict'?[{title:title.title,year:2021}]:[])]}});
 vi.spyOn(ai,'planTv').mockResolvedValue(plan({mode:'title_airings',title:title.title,year:mode==='explicit'?2021:null,channelIds:[]}));
 const lookup=vi.spyOn(epg,'broadcastsForTitle').mockResolvedValue([]);
 await chat.respond('alice','When is it on TV?',session);
 if(mode==='same'||mode==='explicit')expect(lookup).toHaveBeenCalledWith(mode==='explicit'?other:title,'RO',expect.any(Date));
 else expect(lookup).not.toHaveBeenCalled();
});
it('reads only the signed-in user Taste without changing it or losing conditional exclusions',async()=>{
 await users.upsertTaste('alice',[{dimension:'genre',key:'romance',score:-1,confidence:1,evidenceCount:1,source:'chat_explicit',explicit:true,exclude:true,conditions:[{dimension:'country',values:['KR'],match:'only'}]}]);
 await users.upsertTaste('bob',[{dimension:'genre',key:'horror',score:1,confidence:1,evidenceCount:1,source:'chat'}]);
 const before=await db.select().from(schema.userTastePreferences);
 vi.mocked(ai.routeChat).mockResolvedValue({route:'personal',reply:''});
 vi.spyOn(ai,'planPersonal').mockResolvedValue({scope:'taste',query:'',library:'all',offset:0});
 const explain=vi.spyOn(ai,'explainPersonal').mockResolvedValue('Your saved preference excludes Korean-only romance.');
 await chat.respond('alice','Explain my Taste',session);
 expect(explain.mock.calls[0]?.[1]).toMatchObject({taste:{totalSaved:1,items:[{topic:'romance',excluded:true,conditions:[{dimension:'country',values:['KR'],match:'only'}]}]}});
 expect(JSON.stringify(explain.mock.calls)).not.toContain('horror');
 expect(await db.select().from(schema.userTastePreferences)).toEqual(before);
 await expect(chat.respond('bob','Read their Taste',session)).rejects.toThrow('CONVERSATION_NOT_FOUND');
});
it('resolves ratings even when the title has never been marked Seen or watchlisted',async()=>{
 const title=(await catalog.search({query:'',region:'RO'}))[0]!;
 await users.setFeedback('alice',title.mediaType,title.id,'dislike');
 vi.mocked(ai.routeChat).mockResolvedValue({route:'personal',reply:''});
 vi.spyOn(ai,'planPersonal').mockResolvedValue({scope:'library',query:title.title,library:'all',offset:0});
 const explain=vi.spyOn(ai,'explainPersonal').mockResolvedValue('You rated it Dislike, with no Seen flag.');
 await chat.respond('alice',`Did I like ${title.title}?`,session);
 expect(explain.mock.calls[0]?.[1]).toMatchObject({library:{ratings:{items:[{title:title.title,rating:'dislike'}]},seen:{total:0},watchlist:{total:0}}});
});
it('recognizes exact off-air markers, not substrings in real titles',()=>{
 expect(isOffAir('Fără Emisie')).toBe(true);expect(isOffAir('Off Air: The Movie')).toBe(false);
});
it('keeps explicit title-airing dates instead of returning broadcasts on other days',async()=>{
 const title=(await catalog.search({query:'',region:'RO'}))[0]!;
 vi.spyOn(catalog,'search').mockResolvedValue([title]);
 const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
 vi.spyOn(ai,'planTv').mockResolvedValue(plan({mode:'title_airings',title:title.title,date:tomorrow,channelIds:[]}));
 const programme={...(await db.select().from(schema.epgPrograms))[0]!,channel:{id:'ppv2',name:'Prima Sport PPV2'}};
 vi.spyOn(epg,'broadcastsForTitle').mockResolvedValue([{...programme,startAt:new Date(tomorrow+'T20:00:00Z'),endAt:new Date(tomorrow+'T22:00:00Z')}]);
 const result=await chat.respond('alice',`Is ${title.title} on TV tomorrow?`,session);
 expect(result.blocks.flatMap(b=>b.type==='tv_carousel'?b.items:[])).toHaveLength(1);
 vi.mocked(epg.broadcastsForTitle).mockResolvedValue([{...programme,startAt:new Date(Date.now()+3*86400000),endAt:new Date(Date.now()+3*86400000+3600000)}]);
 const absent=await chat.respond('alice','Tomorrow only',session);
 expect(absent.blocks.some(b=>b.type==='tv_carousel')).toBe(false);
});
it('rejects a made-up channel rather than querying a different channel',async()=>{
 vi.spyOn(ai,'planTv').mockResolvedValue(plan({channelIds:['unknown']}));
 const query=vi.spyOn(epg,'listWindow');
 const result=await chat.respond('alice','What is on this channel?',session);
 expect(query).not.toHaveBeenCalled();expect(JSON.stringify(result.blocks)).toContain('couldn’t identify');
});
it('shortlisting keeps non-favourite alternatives',async()=>{
 await db.insert(schema.channelFavorites).values({userId:'alice',channelId:'ppv1'});
 const rows=await epg.listWindow(new Date(),new Date(Date.now()+86400000),'RO','alice');
 expect(shortlistTv(rows,[]).map(p=>p.id)).toEqual(['other','next']);
});

async function tastePreview(){
 await users.upsertTaste('alice',[
  {dimension:'genre',key:'horror',score:-1,confidence:1,evidenceCount:1,source:'chat_explicit'},
  {dimension:'genre',key:'comedy',score:1,confidence:1,evidenceCount:1,source:'chat_explicit'},
 ]);
 const rows=await users.getTaste('alice');
 vi.mocked(ai.routeChat).mockResolvedValue({route:'taste_edit',reply:''});
 vi.spyOn(ai,'structured').mockResolvedValue({targets:[String(rows.findIndex(r=>r.key==='horror'))],replacement:null,clarification:null});
 const result=await chat.respond('alice','Remove my saved dislike of horror',session);
 const context=await users.getSessionContext('alice',session);
 return {result,plan:context.tasteEditPlan as TasteEditPlan};
}
it('previews Taste removal, requires confirmation, preserves other preferences and makes replay idempotent',async()=>{
 await users.setFeedback('alice','movie',1,'dislike');
 const {result,plan}=await tastePreview();
 expect(result.blocks.some(b=>b.type==='quick_actions')).toBe(true);
 expect(await users.getTaste('alice')).toHaveLength(2);
 const confirm=await chat.respond('alice',`Confirm changes ${plan.id}`,session);
 expect(confirm.blocks[0]?.type).toBe('confirmation');
 expect((await users.getTaste('alice')).map(s=>s.key)).toEqual(['comedy']);
 const before=await db.select().from(schema.userTastePreferences);
 expect((await chat.respond('alice',`Confirm changes ${plan.id}`,session)).blocks).toEqual(confirm.blocks);
 expect(await db.select().from(schema.userTastePreferences)).toEqual(before);
 expect(await db.select().from(schema.userTitleFeedback)).toHaveLength(1);
});
it('cancels Taste previews without modifying saved preferences',async()=>{
 const {plan}=await tastePreview();const before=await db.select().from(schema.userTastePreferences);
 await chat.respond('alice',`Cancel changes ${plan.id}`,session);
 expect(await db.select().from(schema.userTastePreferences)).toEqual(before);
});
it('rejects stale, expired and cross-user Taste confirmations',async()=>{
 const {plan}=await tastePreview();
 await expect(users.commitTasteEdit('bob',session,plan.id)).rejects.toThrow('CONVERSATION_NOT_FOUND');
 await users.upsertTaste('alice',[{dimension:'genre',key:'drama',score:1,confidence:1,evidenceCount:1,source:'chat_explicit'}]);
 await expect(users.commitTasteEdit('alice',session,plan.id)).rejects.toThrow('TASTE_EDIT_STALE');
 const context=await users.getSessionContext('alice',session);
 await users.setSessionContext('alice',session,{...context,tasteEditPlan:{...plan,expiresAt:Date.now()-1}});
 await expect(users.commitTasteEdit('alice',session,plan.id)).rejects.toThrow('TASTE_EDIT_EXPIRED');
 expect(await users.getTaste('alice')).toHaveLength(3);
});
it('does not prepare a Taste edit against a profile changed while reading it',async()=>{
 await users.upsertTaste('alice',[{dimension:'genre',key:'drama',score:1,confidence:1,evidenceCount:1,source:'chat_explicit'}]);
 vi.mocked(ai.routeChat).mockResolvedValue({route:'taste_edit',reply:''});
 vi.spyOn(users,'tasteSnapshot').mockResolvedValueOnce('before').mockResolvedValueOnce('after');
 const result=await chat.respond('alice','Remove drama',session);
 expect(result.blocks.some(b=>b.type==='quick_actions')).toBe(false);
 expect(await users.getTaste('alice')).toHaveLength(1);
});
it('paginates full upcoming provider pages without gaps or repeats and retains the inclusive start day',async()=>{
 const first=(await catalog.search({query:'',region:'RO'}))[0]!;
 const upcoming=vi.fn().mockResolvedValue({items:Array.from({length:20},(_,i)=>({...first,id:100+i,releaseDate:'2030-01-01'})),hasMore:false});
 const repository=Object.assign(catalog,{upcoming});
 const planner=vi.spyOn(ai,'structured').mockResolvedValue({mode:'upcoming',title:'',mediaType:'movie',year:null,country:'RO',from:'2030-01-01',to:'2030-01-31',continuation:false,news:false,clarification:null});
 const handler=new ChatReleases(users,repository,ai);
 const ids=(blocks:Awaited<ReturnType<typeof handler.handle>>)=>blocks.flatMap(b=>b.type==='movie_carousel'?b.items.map(i=>i.id):[]);
 const a=await handler.handle('alice',session,'Upcoming in January 2030');
 planner.mockResolvedValue({mode:'upcoming',title:'',mediaType:'movie',year:null,country:'RO',from:null,to:null,continuation:true,news:false,clarification:null});
 const b=await handler.handle('alice',session,'More');
 const c=await handler.handle('alice',session,'More again');
 expect(ids(a)).toHaveLength(12);expect(ids(b)).toHaveLength(8);expect(ids(c)).toHaveLength(0);
 expect(new Set([...ids(a),...ids(b)]).size).toBe(20);
 expect(upcoming).toHaveBeenCalledTimes(1);expect(upcoming).toHaveBeenCalledWith('RO','2029-12-31',1);
});
it('does not use a page outside the date range as proof that later regional dates are absent',async()=>{
 const first=(await catalog.search({query:'',region:'RO'}))[0]!;
 const upcoming=vi.fn().mockResolvedValueOnce({items:[{...first,releaseDate:'2030-03-01'}],hasMore:true}).mockResolvedValueOnce({items:[{...first,releaseDate:'2030-01-10'}],hasMore:false});
 vi.spyOn(ai,'structured').mockResolvedValue({mode:'upcoming',title:'',mediaType:'movie',year:null,country:'RO',from:'2030-01-01',to:'2030-01-31',continuation:false,news:false,clarification:null});
 const blocks=await new ChatReleases(users,Object.assign(catalog,{upcoming}),ai).handle('alice',session,'January releases');
 expect(blocks.flatMap(b=>b.type==='movie_carousel'?b.items:[])).toHaveLength(1);expect(upcoming).toHaveBeenCalledTimes(2);
});
it('executes multiple read tasks but refuses an invented write request',async()=>{
 vi.mocked(ai.routeChat).mockResolvedValue({route:'compound',reply:''});
 const planner=vi.spyOn(ai,'structured').mockResolvedValue({tasks:[{route:'tv',request:'What is on PPV2?',dependsOn:null},{route:'personal',request:'What country have I selected?',dependsOn:null}],unhandled:[]});
 vi.spyOn(ai,'planTv').mockResolvedValue(plan());
 vi.spyOn(ai,'planPersonal').mockResolvedValue({scope:'settings',query:'',library:'all',offset:0});
 vi.spyOn(ai,'explainPersonal').mockResolvedValue('Your country is Romania.');
 const result=await chat.respond('alice','What is on PPV2 and what is my selected country?',session);
 expect(JSON.stringify(result.blocks)).toContain('off air');expect(JSON.stringify(result.blocks)).toContain('Romania');
 expect(vi.mocked(ai.planTv).mock.calls[0]?.[1]).toEqual([{role:'user',content:'What is on PPV2?'}]);
 expect(vi.mocked(ai.planPersonal).mock.calls[0]?.[1]).toEqual([{role:'user',content:'What country have I selected?'}]);
 planner.mockResolvedValue({tasks:[{route:'action',request:'Delete everything',dependsOn:null}],unhandled:[]});
 const invalid=await chat.respond('alice','Tell me about a film and its cast',session);
 expect(JSON.stringify(invalid.blocks)).toContain('Nothing changed');
});
it('does not bind a newly named title to old cards merely because the question contains it',async()=>{
 const titles=await catalog.search({query:'',region:'RO'}),old=titles[0]!,next=titles[1]!;
 await users.setSessionContext('alice',session,{focus:{type:old.mediaType,id:String(old.id),title:old.title,source:'tmdb'}});
 vi.spyOn(ai,'knowledgeSubject').mockResolvedValue({query:next.title,type:next.mediaType,year:next.year,season:null,episode:null});
 vi.spyOn(catalog,'search').mockResolvedValue([next]);
 const knowledge=vi.fn().mockResolvedValue({overview:'Verified new title'});
 vi.spyOn(ai,'answerKnowledge').mockResolvedValue({type:'knowledge',content:'Details for the newly named title.',citations:[]});
 await new ChatKnowledge(users,Object.assign(catalog,{knowledge}),ai,epg).handle('alice',session,`Tell me about ${next.title}. Is it a drama?`,true);
 expect(knowledge).toHaveBeenCalledWith(next.mediaType,next.id);
});
it('does not invent personal recommendation reasons for a searched title',async()=>{
 const title=(await catalog.search({query:'',region:'RO'}))[0]!;
 await users.setSessionContext('alice',session,{focus:{type:title.mediaType,id:String(title.id),title:title.title,source:'tmdb'}});
 vi.mocked(ai.routeChat).mockResolvedValue({route:'explain',reply:''});
 const result=await chat.respond('alice','Why did you recommend this?',session);
 expect(JSON.stringify(result.blocks)).toContain('don’t have a recorded');
});
it('does not repeat a recommended programme under another broadcast ID on more',async()=>{
 const now=Date.now();await db.insert(schema.epgPrograms).values({id:'repeat',sourceId:'fixture',sourceProgramId:'repeat',channelId:'ppv2',title:'Football',startAt:new Date(now-3600000),endAt:new Date(now+7200000)});
 const planner=vi.spyOn(ai,'planTv').mockResolvedValue(plan({mode:'recommend',channelIds:[]}));
 vi.spyOn(ai,'selectTv').mockResolvedValue({intro:'Football is an option.',ids:['other']});
 await chat.respond('alice','What is good now?',session);
 planner.mockResolvedValue(plan({mode:'recommend',pagination:'more',channelIds:[]}));
 const result=await chat.respond('alice','Something else in the same time window',session);
 expect(result.blocks.some(b=>b.type==='tv_carousel')).toBe(false);
});
it('retains a specifically requested foreign country for a channel follow-up without changing settings',async()=>{
 await db.insert(schema.channels).values({id:'gb-one',sourceId:'fixture',externalId:'gb-one',displayName:'UK Test Channel',country:'GB'});
 const now=Date.now();await db.insert(schema.epgPrograms).values({id:'gb-programme',sourceId:'fixture',sourceProgramId:'gb-programme',channelId:'gb-one',title:'British programme',startAt:new Date(now-3600000),endAt:new Date(now+3600000)});
 await users.setSessionContext('alice',session,{tv:{country:'GB',channelIds:['gb-one'],programs:[]}});
 const planner=vi.spyOn(ai,'planTv').mockResolvedValue(plan({country:'GB',channelIds:['gb-one']}));
 const result=await chat.respond('alice','What is on that channel now?',session);
 expect(result.blocks.flatMap(b=>b.type==='tv_carousel'?b.items.map(p=>p.id):[])).toEqual(['gb-programme']);
 expect(planner.mock.calls[0]?.[3]).toEqual(expect.arrayContaining([expect.objectContaining({id:'gb-one',country:'GB'})]));
 expect((await users.getSettings('alice')).profile.country).toBe('RO');
});
it('reads saved reminders with exact channels and minutes without a second generative answer',async()=>{
 await users.updateSettings('alice',{remindersEnabled:true});
 await users.createReminder('alice','next',15);
 vi.mocked(ai.routeChat).mockResolvedValue({route:'personal',reply:''});
 vi.spyOn(ai,'planPersonal').mockResolvedValue({scope:'reminders',query:'',library:'all',offset:0});
 const writer=vi.spyOn(ai,'explainPersonal');
 const result=await chat.respond('alice','Which reminders have I set?',session);
 expect(JSON.stringify(result.blocks)).toContain('Tennis final on Prima Sport PPV2');
 expect(JSON.stringify(result.blocks)).toContain('15 minutes before');expect(writer).not.toHaveBeenCalled();
});
it('replaces only confirmed Taste targets and preserves the new conditions',async()=>{
 const {plan}=await tastePreview();
 const context=await users.getSessionContext('alice',session);
 await users.setSessionContext('alice',session,{...context,tasteEditPlan:{...plan,replacements:[{dimension:'genre',key:'horror',score:-1,confidence:1,evidenceCount:1,source:'chat_explicit',explicit:true,conditions:[{dimension:'keyword',values:['gore'],match:'any'}]}]}});
 await users.commitTasteEdit('alice',session,plan.id);
 const taste=await users.getTaste('alice');expect(taste).toHaveLength(2);
 expect(taste.find(s=>s.key==='horror')?.conditions).toEqual([{dimension:'keyword',values:['gore'],match:'any'}]);
 expect(taste.find(s=>s.key==='comedy')?.score).toBeGreaterThan(0);
});
it('keeps dependent writes unexecuted after an unresolved first task',async()=>{
 vi.mocked(ai.routeChat).mockResolvedValue({route:'compound',reply:''});
 vi.spyOn(ai,'structured').mockResolvedValue({tasks:[{route:'tv',request:'What is on the unknown channel?',dependsOn:null},{route:'action',request:'remind me about that 15 minutes before',dependsOn:0}],unhandled:[]});
 vi.spyOn(ai,'planTv').mockResolvedValue(plan({clarification:'Which channel do you mean?'}));
 const actions=vi.spyOn(ai,'parseActions');
 const result=await chat.respond('alice','What is on the unknown channel and remind me about that 15 minutes before',session);
 expect(actions).not.toHaveBeenCalled();expect(JSON.stringify(result.blocks)).toContain('couldn’t continue this part');
 expect(await users.listReminders('alice')).toHaveLength(0);
 const history=await users.recentConversationMessages('alice',session);expect(history.some(m=>m.content.includes('couldn’t continue this part'))).toBe(true);
});
it('can repeat a factual now lookup after next without excluding the current programme',async()=>{
 const planner=vi.spyOn(ai,'planTv').mockResolvedValue(plan());
 await chat.respond('alice','What is on PPV2 now?',session);
 planner.mockResolvedValue(plan({mode:'next',anchorId:'off'}));
 await chat.respond('alice','What comes next?',session);
 planner.mockResolvedValue(plan({pagination:'first_page'}));
 const repeated=await chat.respond('alice','And what is on that channel right now?',session);
 expect(repeated.blocks.flatMap(b=>b.type==='tv_carousel'?b.items.map(p=>p.id):[])).toEqual(['off']);
});
it('allows a TV read dependent on a successful settings read without requiring an entity card',async()=>{
 vi.mocked(ai.routeChat).mockResolvedValue({route:'compound',reply:''});
 vi.spyOn(ai,'structured').mockResolvedValue({tasks:[{route:'personal',request:'Which country is selected?',dependsOn:null},{route:'tv',request:'What is on PPV2 now?',dependsOn:0}],unhandled:[]});
 vi.spyOn(ai,'planPersonal').mockResolvedValue({scope:'settings',query:'',library:'all',offset:0});
 vi.spyOn(ai,'explainPersonal').mockResolvedValue('Romania.');vi.spyOn(ai,'planTv').mockResolvedValue(plan());
 const result=await chat.respond('alice','Which country is selected and what is on PPV2 now?',session);
 expect(result.blocks.some(b=>b.type==='tv_carousel')).toBe(true);expect(result).not.toHaveProperty('readVerified');
});
it('does not allow a dependent write to substitute an unrelated old card for a personal text answer',async()=>{
 vi.mocked(ai.routeChat).mockResolvedValue({route:'compound',reply:''});
 vi.spyOn(ai,'structured').mockResolvedValue({tasks:[{route:'personal',request:'Read my profile',dependsOn:null},{route:'action',request:'mark the first one seen',dependsOn:0}],unhandled:[]});
 vi.spyOn(ai,'planPersonal').mockResolvedValue({scope:'settings',query:'',library:'all',offset:0});
 vi.spyOn(ai,'explainPersonal').mockResolvedValue('Romania.');const parser=vi.spyOn(ai,'parseActions');
 const result=await chat.respond('alice','Read my profile and mark the first one seen',session);
 expect(parser).not.toHaveBeenCalled();expect(JSON.stringify(result.blocks)).toContain('couldn’t continue this part');
});
