import {it,expect} from 'vitest';
import {scoreCandidate} from '../src/services/recommendation.js';
import {conditionApplies} from '../src/services/semantic-taste.js';
import {fixtureCatalog} from '../src/fixtures/catalog.js';
import {filterQuerySchema,type TasteSignal,type ContentItem} from '../src/domain/types.js';
const query=filterQuerySchema.parse({intent:'DISCOVERY',availabilityScope:'all_providers'});
const signal:TasteSignal={dimension:'country',key:'china',score:-.9,confidence:.8,evidenceCount:1,source:'chat_explicit',conditions:[{dimension:'format',values:['movie','series']}]};
const base:ContentItem={...fixtureCatalog[0]!,genres:['Drama'],keywords:[],moods:[],countries:['US']};
function penalties(item=base,s=signal){return scoreCandidate(item,query,{taste:[s],viewerIds:['u'],temporaryMoods:[],ownedProviderIds:[],watchedIds:new Set(),watchlistIds:new Set()})!.evidence.filter(e=>e.code.startsWith('negative:'));}
it('a scoped country applies to that country AND scope, never all movies/series',()=>{
 expect(penalties()).toHaveLength(0);
 expect(penalties({...base,countries:['CN']})).toHaveLength(1);
 expect(penalties({...base,countries:['JP']})).toHaveLength(0);
 expect(penalties({...base,countries:['CN']},{...signal,conditions:[{dimension:'format',values:['series']}]})).toHaveLength(0);
});
it('Chinese romance remains one AND combination, not a dislike of all romance or all Chinese content',()=>{
 const s:TasteSignal={...signal,dimension:'combination',key:'Chinese romance',conditions:[{dimension:'country',values:['China']},{dimension:'genre',values:['Romance']}]};
 expect(penalties({...base,genres:['Romance']},s)).toHaveLength(0);
 expect(penalties({...base,countries:['CN']},s)).toHaveLength(0);
 expect(penalties({...base,countries:['CN'],genres:['Romance']},s)).toHaveLength(1);
 expect(conditionApplies({...base,countries:['CN'],genres:['Romance']},s)).toBe(true);
});
it('scoped keywords still require the keyword, and Kpop matches K-pop tags',()=>{
 const s={...signal,dimension:'keyword',key:'kpop'};
 expect(penalties(base,s)).toHaveLength(0);
 expect(penalties({...base,keywords:['k-pop']},s)).toHaveLength(1);
});
it('does not double count equivalent saved country spellings',()=>{
 const ranked=scoreCandidate({...base,countries:['CN']},query,{taste:[signal,{...signal,key:'CN',conditions:[]}],viewerIds:['u'],temporaryMoods:[],ownedProviderIds:[],watchedIds:new Set(),watchlistIds:new Set()});
 expect(ranked!.evidence.filter(e=>e.code==='negative:country')).toHaveLength(1);
});
