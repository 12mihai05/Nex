import {it,expect,vi} from 'vitest';
import {resolveTasteExamples,type TasteExampleRequest} from '../src/services/taste-examples.js';
import {fixtureCatalog} from '../src/fixtures/catalog.js';
import type {TmdbRepository} from '../src/repositories/tmdb-repository.js';
import type {UserRepository} from '../src/repositories/user-repository.js';
import type {AiService} from '../src/services/ai.js';
import {aggregateEvidence} from '../src/services/taste.js';
import {personalizedSources} from '../src/services/candidates.js';
import {ChatService} from '../src/services/chat.js';
import {isPersistentPreference} from '../src/services/intent.js';
const item={...fixtureCatalog[0]!,title:'Arrival',originalTitle:'Arrival',id:329865,year:2016,overview:'A linguist works with a team to communicate with visitors from another world.'};
const message='I love movies like Arrival (2016).';
const request:TasteExampleRequest={title:'Arrival',year:2016,mediaType:'movie',director:null,score:.9,statement:message};
const catalog=()=>({search:vi.fn(async()=>[item]),getTitle:vi.fn(async()=>item),related:vi.fn(async()=>[fixtureCatalog[1]!])}) as unknown as TmdbRepository;
it('resolves verified premises without guessing why or expanding genre/country traits',async()=>{
 const result=await resolveTasteExamples(catalog(),[request],message,'RO');
 expect(result.issues).toEqual([]);expect(result.signals).toHaveLength(1);
 expect(result.signals[0]).toMatchObject({dimension:'story',score:.75,meaning:item.overview,example:{tmdbId:329865,mediaType:'movie'}});
 expect(result.signals[0]!.key).not.toContain('329865');
});
it('asks about remakes, missing titles and unavailable descriptions without inventing facts',async()=>{
 const c=catalog();c.search=async()=>[item,{...item,id:2,year:1996}];
 expect((await resolveTasteExamples(c,[{...request,year:null}],message,'RO')).issues[0]).toContain('multiple versions of Arrival');
 c.search=async()=>[];expect((await resolveTasteExamples(c,[request],message,'RO')).issues[0]).toContain('couldn’t identify');
 c.search=async()=>[item];c.getTitle=async()=>({...item,overview:''});
 expect((await resolveTasteExamples(c,[request],message,'RO')).issues[0]).toContain('description');
});
it('rejects invented supporting quotes and keeps negative examples negative',async()=>{
 const c=catalog();expect((await resolveTasteExamples(c,[{...request,statement:'I love Titanic'}],message,'RO')).issues).toHaveLength(1);
 const negative='I disliked Arrival (2016).';
 expect((await resolveTasteExamples(c,[{...request,score:-.9,statement:negative}],negative,'RO')).signals[0]!.score).toBeLessThan(0);
 expect(isPersistentPreference(negative)).toBe(true);expect(isPersistentPreference('I loved Arrival')).toBe(true);
 expect(isPersistentPreference('Is Arrival good?')).toBe(false);
});
it('uses a verified director explicitly supplied in text when extraction omits that field',async()=>{
 const c=catalog();c.search=async()=>[item,{...item,id:3}];
 c.getTitle=async(_type,id)=>({...item,id,director:id===item.id?'Denis Villeneuve':'Another Director'});
 const statement='I love Arrival (2016) directed by Denis Villeneuve';
 const result=await resolveTasteExamples(c,[{...request,statement}],statement,'RO');
 expect(result.issues).toEqual([]);expect(result.items.map(i=>i.id)).toEqual([item.id]);
});
it('preserves canonical examples in evidence aggregation and uses positive examples for retrieval',async()=>{
 const signal=(await resolveTasteExamples(catalog(),[request],message,'RO')).signals[0]!;
 const stored=aggregateEvidence(signal.dimension,signal.key,[{id:'chat_explicit',source:'chat_explicit',score:signal.score,meaning:signal.meaning!,example:signal.example!,at:new Date().toISOString(),weight:2.55,explicit:true}]);
 expect(stored.example).toEqual(signal.example);expect(stored.meaning).toBe(item.overview);
 const c=catalog();const state={taste:[stored,{...stored,score:-.8}],country:'RO',ownedProviderIds:[8]} as Awaited<ReturnType<UserRepository['getRecommendationState']>>;
 const results=await Promise.all(personalizedSources(c,state,{region:'RO',providerIds:[8]}));
 expect(c.related).toHaveBeenCalledTimes(1);expect(results.flat()).toHaveLength(1);
});
it('saves verified examples in Chat, persists card references and never writes ratings/Seen',async()=>{
 const users={createConversation:async()=>'s',addConversationMessage:async()=>'m',getSettings:async()=>({profile:{country:'RO'}}),upsertTaste:vi.fn(async()=>{}),saveDisplayedReferences:vi.fn(async()=>{})};
 const ai={extractTaste:async()=>({signals:[],examples:[request]})};
 const result=await new ChatService(users as unknown as UserRepository,catalog(),ai as unknown as AiService).respond('u',message);
 expect(result.blocks.map(b=>b.type)).toEqual(['confirmation','movie_carousel']);
 expect(users.upsertTaste).toHaveBeenCalledOnce();expect(users.saveDisplayedReferences).toHaveBeenCalledWith('u','s','m',[expect.objectContaining({externalId:'329865'})]);
});
it('does not partially save other extracted preferences when a named example is unresolved',async()=>{
 const users={createConversation:async()=>'s',addConversationMessage:async()=>'m',getSettings:async()=>({profile:{country:'RO'}}),upsertTaste:vi.fn()};
 const ai={extractTaste:async()=>({signals:[{dimension:'keyword',key:'space',score:.9,confidence:.9}],examples:[request]})};
 const c=catalog();c.search=async()=>[];
 const result=await new ChatService(users as unknown as UserRepository,c,ai as unknown as AiService).respond('u',message);
 expect(users.upsertTaste).not.toHaveBeenCalled();expect(result.blocks[0]).toHaveProperty('content',expect.stringContaining('Nothing changed'));
});
