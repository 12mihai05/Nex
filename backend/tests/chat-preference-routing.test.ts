import {it,expect,vi} from 'vitest';
import {ChatService} from '../src/services/chat.js';
import {isPersistentPreference} from '../src/services/intent.js';
import {isExplicitKeywordExclusion} from '../src/services/preference-exclusions.js';
import {scoreCandidate} from '../src/services/recommendation.js';
import {filterQuerySchema,type TasteSignal} from '../src/domain/types.js';
import {fixtureCatalog} from '../src/fixtures/catalog.js';
import type {UserRepository} from '../src/repositories/user-repository.js';
import type {AiService} from '../src/services/ai.js';
const declarations=[
 'I dont really like animes like cartoons or or animations yes but no animes',
 'I told you that to exclude animes from my taste but to not exclude also animations or cartoons',
 "I don't particularly enjoy anime", 'Please exclude anime from my preferences',
 'Could you update my taste to exclude anime but not cartoons?',
 'Exclude form my feed asian mvoies or series but not Russian ones',
 'I am not a fan of anime',
];
it('routes ordinary dislike wording and explicit Taste corrections to persistence, never recommendation cards',async()=>{
 for(const message of declarations){
  expect(isPersistentPreference(message)).toBe(true);
  const users={latestConversation:async()=>undefined,createConversation:vi.fn(async()=>'session'),addConversationMessage:vi.fn(async()=>'message'),upsertTaste:vi.fn(async()=>{})};
  const ai={extractTaste:vi.fn(async()=>({signals:[{dimension:'keyword',key:'anime',score:-.9,confidence:.95,evidenceCount:1,source:'onboarding_text',statement:message}]}))};
  const chat=new ChatService(users as unknown as UserRepository,undefined,ai as unknown as AiService);
  const response=await chat.respond('u',message);
  expect(users.upsertTaste).toHaveBeenCalledWith('u',[expect.objectContaining({key:'anime',score:-.9,source:'chat_explicit'})]);
  expect(response.blocks.map(b=>b.type)).toEqual(['confirmation']);
 }
});
it('keeps assistant punctuation clean without shifting citation offsets or modifying catalog titles',async()=>{
 const {cleanChatBlocks}=await import('../src/domain/chat-copy.js');
 const block={type:'knowledge' as const,content:'A—B [1]',citations:[{title:'source',url:'https://example.com',start:4,end:7}]};
 expect(cleanChatBlocks([block])[0]).toEqual({...block,content:'A, B [1]',citations:[{...block.citations[0]!,start:5,end:8}]});
});
it('does not silently turn an extraction failure into discovery or a saved claim',async()=>{
 const users={latestConversation:async()=>undefined,createConversation:async()=>'s',addConversationMessage:async()=>'m',upsertTaste:vi.fn()};
 const ai={extractTaste:vi.fn(async()=>{throw Error('Unavailable');})};
 const response=await new ChatService(users as unknown as UserRepository,undefined,ai as unknown as AiService).respond('u',declarations[0]!);
 expect(users.upsertTaste).not.toHaveBeenCalled();expect(response.blocks.map(b=>b.type)).toEqual(['text']);
 expect(response.blocks[0]).toHaveProperty('content',expect.stringContaining('Nothing changed'));
});
it('keeps temporary wishes and hypothetical declarations out of durable Taste',()=>{
 for(const message of ['I dont really like anime tonight','Maybe I dislike anime','If I dislike anime, can you update my taste?','Exclude anime from my taste, just kidding'])expect(isPersistentPreference(message)).toBe(false);
});
it('an explicit anime exclusion uses catalog tags, not all animation, cartoons or Japanese content',()=>{
 const signal:TasteSignal={dimension:'keyword',key:'anime',score:-.9,confidence:.7,evidenceCount:1,source:'chat_explicit',statement:declarations[1]};
 expect(isExplicitKeywordExclusion(signal)).toBe(true);
 expect(isExplicitKeywordExclusion({...signal,statement:'Do not exclude anime from my taste'})).toBe(false);
 expect(isExplicitKeywordExclusion({...signal,statement:'I dislike anime'})).toBe(false);
 const context={viewerIds:['u'],taste:[signal],temporaryMoods:[],ownedProviderIds:[],watchedIds:new Set<number>(),watchlistIds:new Set<number>()};
 const query=filterQuerySchema.parse({intent:'DISCOVERY',availabilityScope:'all_providers'});
 const base={...fixtureCatalog[0]!,genres:['Animation'],moods:[],keywords:[],originalLanguage:'ja',countries:['JP']};
 expect(scoreCandidate({...base,keywords:['anime']},query,context)).toBeNull();
 expect(scoreCandidate({...base,keywords:['cartoon']},query,context)).not.toBeNull();
 expect(scoreCandidate({...base,genres:['Drama']},query,context)).not.toBeNull();
 expect(scoreCandidate({...base,keywords:['anime']},{...query,intent:'TITLE_LOOKUP'},context)).not.toBeNull();
 expect(scoreCandidate({...base,keywords:['anime']},query,{...context,taste:[{...signal,score:.8}]})).not.toBeNull();
});
