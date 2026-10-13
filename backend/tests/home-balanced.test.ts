import {it,expect,afterEach,vi} from 'vitest';
import {homeWindow,compactHomeRows} from '../src/services/home-delivery.js';
import {aggregateEvidence,type TasteEvidence} from '../src/services/taste.js';
import {interestSeeds,representativeFavorites} from '../src/services/interest-coverage.js';
import {boundedSettled} from '../src/services/bounded-map.js';
import {fixtureCatalog} from '../src/fixtures/catalog.js';
import {resetConfigForTests} from '../src/config.js';
import {rankCandidates} from '../src/services/recommendation.js';
import {filterQuerySchema} from '../src/domain/types.js';
import {buildDiscoveryRows,discoveryShelves} from '../src/services/discovery.js';

afterEach(()=>{vi.unstubAllEnvs();resetConfigForTests();});
const state={country:'RO',timezone:'Europe/Bucharest',ownedProviderIds:[],taste:[],watchedIds:new Set<number>(),watchlistIds:new Set<number>(),watchedKeys:new Set<string>(),watchlistKeys:new Set<string>(),ratedKeys:new Set<string>(),rejectedKeys:new Set<string>(),recentlyShown:new Map<string,number>(),wantHints:[],seenHints:[],behaviorPersonalization:true,favorites:[],saved:[]};
it('three initial shelves and six later ones cover all 36 without gaps; legacy stays compatible',()=>{
 const offsets=(first:number,n:number)=>Array.from({length:n},(_,b)=>{const w=homeWindow(b,first);return Array.from({length:w.end-w.start},(_,i)=>w.start+i).filter(i=>i<36);}).flat();
 expect(homeWindow(0,3)).toEqual({start:0,end:3});expect(homeWindow(1,3)).toEqual({start:3,end:9});
 expect(offsets(3,7)).toEqual(Array.from({length:36},(_,i)=>i));expect(offsets(6,6)).toEqual(offsets(3,7));
});
it('compact transport preserves identities and actions but omits ranking internals',()=>{
 const item=fixtureCatalog[0]!,rows=[{id:'for-you',items:[{item,score:10,reason:'A real reason',evidence:[{code:'taste',label:'private',weight:3}]}]}];
 const compact=compactHomeRows(rows);
 expect(compact[0]!.items[0]!.item).toMatchObject({id:item.id,mediaType:item.mediaType,availability:item.availability,metadataOnly:true});
 expect(JSON.stringify(compact)).not.toContain('private');expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(rows).length);
});
it('independent likes build confidence, duplicate events and one franchise do not manufacture it',()=>{
 const entry:TasteEvidence={id:'movie:1',source:'like',score:.72,weight:1,explicit:true,at:new Date().toISOString()};
 const one=aggregateEvidence('actor','someone',[entry]);
 expect(one.confidence).toBeLessThanOrEqual(.18);
 expect(aggregateEvidence('actor','someone',[entry,entry,entry]).confidence).toBe(one.confidence);
 const repeated=Array.from({length:6},(_,i)=>({...entry,id:`movie:${i}`,group:'collection:x'}));
 expect(aggregateEvidence('actor','someone',repeated).confidence).toBeLessThanOrEqual(.18);
 expect(aggregateEvidence('actor','someone',repeated.map(e=>({...e,group:e.id}))).confidence).toBeGreaterThan(one.confidence);
 const explicit={...entry,id:'chat',source:'chat_explicit',score:-1,weight:3};
 expect(aggregateEvidence('actor','someone',[...repeated,explicit])).toMatchObject({score:-1,source:'chat_explicit'});
});
it('legacy switch preserves old confidence calculation without rewriting saved evidence',()=>{
 vi.stubEnv('RECOMMENDATION_PROFILE_VERSION','legacy');resetConfigForTests();
 const e={id:'1',source:'like',score:1,weight:2,explicit:true,at:new Date().toISOString()};
 expect(aggregateEvidence('actor','x',[e]).confidence).toBeCloseTo(2/3);
 expect(interestSeeds(['a','b','c','d'],2,x=>x,2)).toEqual(['a','b']);
});
it('bounded retrieval keeps a stable strongest anchor but covers other interests over time',()=>{
 const inputs=['a','b','c','d','e'];const seen=new Set<string>();
 for(let day=0;day<4;day++){const seeds=interestSeeds(inputs,2,x=>x,day);expect(seeds[0]).toBe('a');seeds.forEach(x=>seen.add(x));}
 expect(seen.size).toBe(5);
});
it('representative favorites include a separate interest rather than only franchise neighbours',()=>{
 const favorites=[1,2,3].map(tmdbId=>({tmdbId,mediaType:'movie',reaction:'like',updatedAt:new Date(100-tmdbId)}));
 const items=favorites.map(f=>({...fixtureCatalog[0]!,id:f.tmdbId,genres:f.tmdbId===3?['Comedy']:['Action'],keywords:[],collection:f.tmdbId===3?null:'Action series'}));
 expect(representativeFavorites(favorites,items,2).map(f=>f.tmdbId)).toEqual([1,3]);
});
it('limited workers start another task as soon as a slot opens and preserve source order',async()=>{
 let resolve!:()=>void;const started:number[]=[];const gate=new Promise<void>(r=>resolve=r);
 const work=boundedSettled([0,1,2],2,async n=>{started.push(n);if(n===0)await gate;return n;});
 await Promise.resolve();await Promise.resolve();expect(started).toEqual([0,1,2]);resolve();
 expect((await work).map(r=>r.status==='fulfilled'?r.value:null)).toEqual([0,1,2]);
});
it('every progressive row retains country exclusions and category membership without duplicates',()=>{
 const taste=[{dimension:'country',key:'CN',score:-1,confidence:1,evidenceCount:1,source:'chat_explicit',exclude:true}];
 const s={...state,taste},seen:string[]=[];const plan=discoveryShelves(s).map(r=>r.id);
 const pool=Array.from({length:500},(_,id)=>({...fixtureCatalog[0]!,id,genres:[['Drama','Comedy','Thriller','Animation'][id%4]!],countries:id%3===0?['CN']:['US'],keywords:[],moods:[],year:2025,runtimeMinutes:90}));
 for(let batch=0;batch<7;batch++){
   const rows=buildDiscoveryRows(pool,s,'u',{},batch,plan,seen,{},3);expect(rows.length).toBeLessThanOrEqual(batch===0?3:6);
   for(const row of rows)for(const r of row.items){expect(r.item.countries).not.toContain('CN');const key=`${r.item.mediaType}:${r.item.id}`;expect(seen).not.toContain(key);seen.push(key);if(row.id.startsWith('genre:'))expect(r.item.genres).toContain(row.id.slice(6));}
 }
 expect(seen.length).toBeGreaterThan(60);
 const ranked=rankCandidates(pool,filterQuerySchema.parse({intent:'DISCOVERY'}),{...s,viewerIds:['u'],temporaryMoods:[]},20);expect(ranked.every(r=>!r.item.countries?.includes('CN'))).toBe(true);
});
