import {it,expect,vi} from 'vitest';
import {personalizedSources} from '../src/services/candidates.js';
import {FixtureTmdbRepository} from '../src/repositories/tmdb-repository.js';
import {fixtureCatalog} from '../src/fixtures/catalog.js';
import {filterQuerySchema,type TasteSignal} from '../src/domain/types.js';
import {scoreCandidate} from '../src/services/recommendation.js';
import {aggregateEvidence} from '../src/services/taste.js';
import {titleRelevance,rankSearch} from '../src/services/search-ranking.js';
import {resolveEntity,type Entity} from '../src/domain/entities.js';
import {isPersistentPreference} from '../src/services/intent.js';
it('scoped dislikes never broaden to unrelated countries or genres',()=>{
 const taste:TasteSignal[]=[{dimension:'combination',key:'Chinese romance',score:-1,confidence:.9,evidenceCount:1,source:'chat_explicit',conditions:[{dimension:'genre',values:['romance']},{dimension:'country',values:['CN']}]}];
 const context={viewerIds:['u'],taste,temporaryMoods:[],ownedProviderIds:[],watchedIds:new Set<number>(),watchlistIds:new Set<number>()};
 for(const [country,genre,negative] of [['CN','Romance',true],['CN','Thriller',false],['US','Romance',false]] as const){
 const r=scoreCandidate({...fixtureCatalog[0]!,countries:[country],genres:[genre]},filterQuerySchema.parse({intent:'DISCOVERY',availabilityScope:'all_providers'}),context)!;
 expect(r.evidence.some(e=>e.code==='negative:combination')).toBe(negative);
 }
});
it('retrieves scoped country/genre interests without replacing explicit runtime or language constraints',async()=>{
 const catalog=new FixtureTmdbRepository(),discover=vi.spyOn(catalog,'discover').mockResolvedValue([]);
 const state={country:'RO',ownedProviderIds:[8],taste:[{dimension:'combination',key:'Japanese drama',score:.8,confidence:.8,conditions:[{dimension:'country',values:['JP']},{dimension:'genre',values:['Drama']}]}]} as Parameters<typeof personalizedSources>[1];
 await Promise.all(personalizedSources(catalog,state,{region:'RO',maxRuntimeMinutes:100,originalLanguages:['ja'],providerIds:[8]}));
 expect(discover).toHaveBeenCalledWith(expect.objectContaining({originCountries:['JP'],genres:['Drama'],maxRuntimeMinutes:100,originalLanguages:['ja'],providerIds:[8]}));
});
it('inferred title traits decay while direct declarations remain stable',()=>{
 const now=Date.now(),at=new Date(now-365*86400000).toISOString();
 const entry={id:'a',source:'like',score:1,weight:2,explicit:true,at};
 expect(aggregateEvidence('genre','drama',[entry],now).confidence).toBeCloseTo(.5);
 expect(aggregateEvidence('genre','drama',[{...entry,source:'chat_explicit'}],now).confidence).toBeCloseTo(2/3);
});
it('search supports partial reordered accented and typo matches without demoting exact titles',()=>{
 expect(titleRelevance('cure death','Maze Runner: The Death Cure')).toBeGreaterThan(.9);
 expect(titleRelevance('amelie','Amélie')).toBe(1);
 expect(titleRelevance('interstelar','Interstellar')).toBeGreaterThan(.7);
 expect(titleRelevance('it','Hitman')).toBeLessThan(1);
 const base=fixtureCatalog[0]!;
 expect(rankSearch('It',[{...base,id:2,title:'Hitman'},{...base,id:1,title:'It'}])[0]!.id).toBe(1);
});
it('references resolve only from known entities and never guess among cards',()=>{
 const a:Entity={type:'movie',id:'1',source:'tmdb',title:'Arrival'},b:Entity={...a,id:'2',title:'Dune'};
 expect(resolveEntity('Tell me more about this',[a])).toEqual(a);
 expect(resolveEntity('Tell me more about this',[a,b])).toBeNull();
 expect(resolveEntity('Tell me more about the second',[a,b])).toEqual(b);
 expect(resolveEntity('Who directed Arrival?',[a,b])).toEqual(a);
});
it('temporary, uncertain, hypothetical and joking statements do not become durable taste',()=>{
 for(const s of ['I hate horror tonight','Maybe I like drama','If I like horror','I love gore, just kidding','I am not sure I like romance'])expect(isPersistentPreference(s)).toBe(false);
 expect(isPersistentPreference('I really dislike Chinese romance movies')).toBe(true);
});
