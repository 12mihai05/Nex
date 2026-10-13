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

let client:ReturnType<typeof createClient>,db:ReturnType<typeof drizzle<typeof schema>>,users:UserRepository,session:string,ai:AiService,epg:EpgService,catalog:FixtureTmdbRepository,chat:ChatService;
const plan=(extra:Partial<TvPlan>={}):TvPlan=>({mode:'schedule',channelIds:['ppv2'],window:'live',date:null,time:null,anchorId:null,title:null,year:null,goal:'',clarification:null,...extra});
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
