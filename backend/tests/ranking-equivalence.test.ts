import {it,expect} from 'vitest';
import {rankCandidates,scoreCandidate,titleKey,rankingWeights,type RecommendationContext} from '../src/services/recommendation.js';
import {conceptEvidence,canonicalConcept} from '../src/services/concepts.js';
import {filterQuerySchema,type ContentItem,type RankedContent} from '../src/domain/types.js';
import {fixtureCatalog} from '../src/fixtures/catalog.js';

// Deliberately slow reference of the former diversity selection algorithm.
function reference(items:ContentItem[],context:RecommendationContext,limit:number){
  const query=filterQuerySchema.parse({intent:'DISCOVERY',availabilityScope:'all_providers'});
  const remaining=items.map(i=>scoreCandidate(i,query,context)).filter((r):r is RankedContent=>r!==null).sort((a,b)=>b.score-a.score);
  const selected:RankedContent[]=[];
  const interests=context.taste.filter(s=>['keyword','theme'].includes(s.dimension)&&s.score>.3&&s.confidence>=.5).map(s=>canonicalConcept(s.key));
  const overlap=(aa:Set<string>,bb:Set<string>)=>[...aa].filter(v=>bb.has(v)).length/Math.max(1,new Set([...aa,...bb]).size);
  const similarity=(a:ContentItem,b:ContentItem)=>Math.max(
    overlap(new Set(a.genres.map(g=>g.toLowerCase().trim())),new Set(b.genres.map(g=>g.toLowerCase().trim()))),
    a.collection&&a.collection===b.collection?1:0,
    overlap(new Set(interests.filter(t=>conceptEvidence(a,t))),new Set(interests.filter(t=>conceptEvidence(b,t)))));
  while(remaining.length&&selected.length<limit){
    let best=0,value=-Infinity;
    remaining.forEach((r,i)=>{const candidate=r.score-(context.personalAdjustments?.size?.24:rankingWeights.diversity)*Math.max(0,...selected.map(s=>similarity(r.item,s.item)));if(candidate>value){best=i;value=candidate;}});
    selected.push(remaining.splice(best,1)[0]!);
  }
  return selected.map(r=>({key:titleKey(r.item),score:r.score}));
}
it('incremental diversity exactly preserves reference ordering, ties, collections and semantic adjustments',()=>{
  const items=Array.from({length:55},(_,i)=>({...fixtureCatalog[0]!,id:i+1,genres:i%7===0?[]:i%2?['Drama','Comedy']:['Thriller'],collection:i%4===0?'Collection':null,keywords:i%3===0?['underdog']:['survival'],overview:'',rating:6+i%4,popularity:i%5,voteCount:300}));
  for(const semantic of [false,true])for(const limit of [1,12,20]){
    const context:RecommendationContext={viewerIds:['test'],taste:[{dimension:'keyword',key:'underdog',score:.8,confidence:1,evidenceCount:1,source:'explicit_edit'}],temporaryMoods:[],ownedProviderIds:[],watchedIds:new Set(),watchlistIds:new Set(),...(semantic?{personalAdjustments:new Map([['movie:10',[{code:'semantic:interest',label:'Test',weight:2}]]])}: {})};
    const actual=rankCandidates(items,filterQuerySchema.parse({intent:'DISCOVERY',availabilityScope:'all_providers'}),context,limit).map(r=>({key:titleKey(r.item),score:r.score}));
    expect(actual).toEqual(reference(items,context,limit));
  }
});
