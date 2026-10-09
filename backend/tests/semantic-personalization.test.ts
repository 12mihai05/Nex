import { readFile, readdir } from 'node:fs/promises';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import * as schema from '../src/db/schema.js';
import { UserRepository } from '../src/repositories/user-repository.js';
import {packVector,unpackVector} from '../src/repositories/recommendation-store.js';
import { FixtureTmdbRepository } from '../src/repositories/tmdb-repository.js';
import { fixtureCatalog } from '../src/fixtures/catalog.js';
import { filterQuerySchema, type ContentItem, type TasteSignal } from '../src/domain/types.js';
import { PersonalizationService, validateReview } from '../src/services/personalization.js';
import { conditionApplies, favouriteInterests, semanticAdjustment, semanticPreferenceMeaning, semanticTitleText, unitVector } from '../src/services/semantic-taste.js';
import type { SemanticModel, ReviewInput } from '../src/services/semantic-model.js';
import { rankCandidates } from '../src/services/recommendation.js';
import { discoverHome } from '../src/services/discovery.js';
import { pickTitle } from '../src/services/pick.js';

const query=filterQuerySchema.parse({intent:'DISCOVERY',availabilityScope:'all_providers'});
const story:TasteSignal={dimension:'story',key:'repairing trust',meaning:'estranged friends repairing trust',statement:'I like estranged friends repairing trust',score:1,confidence:1,evidenceCount:1,source:'chat_explicit'};
const titles:ContentItem[]=Array.from({length:30},(_,i)=>({...fixtureCatalog[0]!,id:i+1,title:`Synthetic ${i+1}`,genres:['Drama'],keywords:[],moods:[],rating:7,popularity:0,voteCount:500,overview:i%2?'Former friends repair their broken trust.':'A crew explores an alien planet.',availability:[]}));
const fake=():SemanticModel=>({version:'fake-v1',available:true,embed:vi.fn(async (texts:string[])=>texts.map(t=>/trust|friends/i.test(t)?[1,0]:[0,1])),review:vi.fn(async (input:ReviewInput)=>({items:input.candidates.map(c=>({key:c.key,fit:0,preferenceKey:null,quote:null}))}))});

describe('semantic personalization and source-to-feed integration',()=>{
  let client:ReturnType<typeof createClient>, users:UserRepository, db:ReturnType<typeof drizzle<typeof schema>>, catalog:FixtureTmdbRepository;
  beforeEach(async()=>{
    client=createClient({url:':memory:'});
    for(const name of (await readdir(new URL('../drizzle/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort())
      await client.executeMultiple((await readFile(new URL(`../drizzle/${name}`,import.meta.url),'utf8')).replaceAll('--> statement-breakpoint',''));
    await client.execute('PRAGMA foreign_keys=ON'); db=drizzle(client,{schema}); users=new UserRepository(db);
    await db.insert(schema.user).values(['alice','bob'].map(id=>({id,name:id,email:`${id}@example.test`,emailVerified:false,createdAt:new Date(),updatedAt:new Date()})));
    catalog=new FixtureTmdbRepository();catalog.discover=async()=>titles;
  });
  afterEach(()=>client.close());
  it('verified movie-example evidence survives storage and editing and influences semantic ranking without history or ratings',async()=>{
    await users.updateSettings('alice',{recommendationEngine:'semantic'});
    const example={...story,key:'stories like a verified example',meaning:'Former friends repair their broken trust.',example:{tmdbId:2,mediaType:'movie' as const,title:'Synthetic 2'}};
    await users.upsertTaste('alice',[example]);
    await users.upsertTaste('alice',[example]);
    let state=await users.getRecommendationState('alice');
    expect(state.taste).toHaveLength(1);expect(state.taste[0]!.evidenceCount).toBe(1);
    expect(state.taste[0]!.example).toEqual(example.example);
    expect(state.watchedKeys.size).toBe(0);expect(state.ratedKeys.size).toBe(0);
    const service=new PersonalizationService(users.recommendationStore(),catalog,async()=>true,fake());
    const personal=await service.prepare(titles,state,'alice',query);
    const ranked=rankCandidates(titles,query,{...state,...personal,viewerIds:['alice'],temporaryMoods:[]});
    expect(ranked[0]!.item.id%2).toBe(0);
    await users.upsertTaste('alice',[{...example,source:'explicit_edit',score:-1,meaning:undefined,example:undefined}]);
    state=await users.getRecommendationState('alice');
    expect(state.taste[0]!.example).toEqual(example.example);
    expect(state.taste[0]!.meaning).toBe(example.meaning);
  });
  it('keeps baseline identical and makes zero model/cache calls',async()=>{
    const model=fake(),reserve=vi.fn(async()=>true),store=users.recommendationStore(),read=vi.spyOn(store,'publicVectors');
    const state=await users.getRecommendationState('alice');
    const result=await new PersonalizationService(store,catalog,reserve,model).prepare(titles,state,'alice',query);
    expect(rankCandidates(titles,query,{...state,...result,viewerIds:['alice'],temporaryMoods:[]})).toEqual(rankCandidates(titles,query,{...state,viewerIds:['alice'],temporaryMoods:[]}));
    expect(model.embed).not.toHaveBeenCalled();expect(reserve).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();
  });
  it('saved story → semantic Home/Pick, edit → changed feed, remove → baseline, warm cache → no API',async()=>{
    await users.updateSettings('alice',{recommendationEngine:'semantic'});await users.upsertTaste('alice',[story]);
    const model=fake(),reserve=vi.fn(async()=>true),service=new PersonalizationService(users.recommendationStore(),catalog,reserve,model);
    let state=await users.getRecommendationState('alice');
    const rows=await discoverHome(catalog,state,'alice',{},0,['for-you'],[],service);
    expect(rows[0]!.items[0]!.item.id%2).toBe(0);
    const pick=await pickTitle(catalog,state,'alice',query,'new',[],service);expect(pick!.item.id%2).toBe(0);
    const calls=vi.mocked(model.embed).mock.calls.length;
    state=await users.getRecommendationState('alice');
    state.taste=state.taste.map(s=>({...s,updatedAt:new Date(Date.now()+1000).toISOString()}));
    await service.prepare(titles,state,'alice',query);expect(vi.mocked(model.embed).mock.calls.length).toBe(calls);
    await users.upsertTaste('alice',[{...story,score:-1,source:'explicit_edit',meaning:undefined}]);
    await users.upsertTaste('alice',[{...story,score:-1,source:'explicit_edit',meaning:undefined}]);
    state=await users.getRecommendationState('alice');expect(state.taste[0]!.meaning).toBe(story.meaning);
    const changed=await discoverHome(catalog,state,'alice',{},0,['for-you'],[],service);expect(changed[0]!.items[0]!.item.id%2).toBe(1);
    await users.removeTaste('alice','story',story.key);state=await users.getRecommendationState('alice');
    expect((await service.prepare(titles,state,'alice',query)).reason).toBe('no_evidence');
  });
  it('never rescues watched/disliked/off-service/over-duration titles; exact lookup unchanged',async()=>{
    await users.updateSettings('alice',{recommendationEngine:'semantic'});await users.upsertTaste('alice',[story]);
    const state=await users.getRecommendationState('alice');state.watchedKeys.add('movie:2');state.rejectedKeys.add('movie:4');
    const service=new PersonalizationService(users.recommendationStore(),catalog,async()=>true,fake());const personal=await service.prepare(titles,state,'alice',query);
    const context={...state,...personal,viewerIds:['alice'],temporaryMoods:[]};
    expect(rankCandidates(titles,query,context,40).some(r=>[2,4].includes(r.item.id))).toBe(false);
    expect(rankCandidates(titles,{...query,providerIds:[8]},context)).toHaveLength(0);
    expect(rankCandidates(titles,{...query,maxRuntimeMinutes:10},context)).toHaveLength(0);
    const exact=await service.prepare(titles,state,'alice',{...query,intent:'TITLE_LOOKUP'});expect(exact.mode).toBe('baseline');
  });
  it('isolates private profiles, cascades account deletion, and bounds cache retention',async()=>{
    const store=users.recommendationStore();await store.putPrivate('alice','same',{secretPreference:'a'});await store.putPrivate('bob','same',{secretPreference:'b'});
    expect(await store.privateValue('alice','same')).not.toEqual(await store.privateValue('bob','same'));
    await db.delete(schema.user).where(eq(schema.user.id,'alice'));expect(await store.privateValue('alice','same')).toBeUndefined();expect(await store.privateValue('bob','same')).toEqual({secretPreference:'b'});
    await db.insert(schema.contentEmbeddings).values({key:'old',vectorJson:'[0,1]',expiresAt:new Date(0)});
    await store.putPublic([{key:'old',vector:[1,0]}]);expect((await store.publicVectors(['old'])).get('old')).toEqual([1,0]);
    for(let i=0;i<35;i++)await store.putPrivate('bob',`key${i}`,[]);
    expect((await db.select().from(schema.userRecommendationCache)).length).toBeLessThanOrEqual(32);
  });
  it('denied budgets and invalid vectors fall back without exposing provider errors',async()=>{
    await users.updateSettings('alice',{recommendationEngine:'semantic'});await users.upsertTaste('alice',[story]);const state=await users.getRecommendationState('alice');
    const model=fake();const service=new PersonalizationService(users.recommendationStore(),catalog,async()=>false,model);
    expect((await service.prepare(titles,state,'alice',query)).reason).toBe('budget');expect(model.embed).not.toHaveBeenCalled();
    model.embed=async()=>[[Number.NaN,0]];
    const broken=await new PersonalizationService(users.recommendationStore(),catalog,async()=>true,model).prepare(titles,state,'alice',query);
    expect(broken.mode).toBe('baseline');expect(broken.personalAdjustments.size).toBe(0);
  });
  it('coalesces concurrent identical requests without leaking across users',async()=>{
    await users.updateSettings('alice',{recommendationEngine:'semantic'});await users.upsertTaste('alice',[story]);const state=await users.getRecommendationState('alice');
    const model=fake(),reserve=vi.fn(async()=>true),service=new PersonalizationService(users.recommendationStore(),catalog,reserve,model);
    const reread={...state,taste:state.taste.map(s=>({...s,updatedAt:new Date(Date.now()+1000).toISOString()}))};
    await Promise.all([service.prepare(titles,state,'alice',query),service.prepare(titles,reread,'alice',query)]);expect(reserve).toHaveBeenCalledTimes(1);
  });
  it('only explicit positive ratings create favourite interests, not Seen or Want to see',async()=>{
    await users.updateSettings('alice',{recommendationEngine:'semantic'});
    await users.markWatched('alice',titles[0]!);await users.addWatchlist('alice',titles[2]!);
    const service=new PersonalizationService(users.recommendationStore(),catalog,async()=>true,fake());
    let state=await users.getRecommendationState('alice');
    expect((await service.prepare(titles,state,'alice',query)).reason).toBe('no_evidence');
    await users.applyFeedback('alice',titles[1]!,'super_like');state=await users.getRecommendationState('alice');
    expect(state.watchedKeys.has('movie:2')).toBe(false);
    const p=await service.prepare(titles,state,'alice',query);expect(p.mode).toBe('semantic');
    expect(rankCandidates(titles,query,{...state,...p,viewerIds:['alice'],temporaryMoods:[]},1)[0]!.item.id%2).toBe(0);
    await users.applyFeedback('alice',titles[1]!,'meh');state=await users.getRecommendationState('alice');
    expect((await service.prepare(titles,state,'alice',query)).reason).toBe('no_evidence');
  });
  it('cached AI reviews work after budget exhaustion without another provider request',async()=>{
    await users.updateSettings('alice',{recommendationEngine:'semantic_ai'});await users.upsertTaste('alice',[story]);const state=await users.getRecommendationState('alice');
    const model=fake(),store=users.recommendationStore();
    const first=await new PersonalizationService(store,catalog,async()=>true,model).prepare(titles,state,'alice',query);expect(first.mode).toBe('semantic_ai');
    const embedCalls=vi.mocked(model.embed).mock.calls.length,reviewCalls=vi.mocked(model.review).mock.calls.length,reserve=vi.fn(async()=>false);
    const warm=await new PersonalizationService(store,catalog,reserve,model).prepare(titles,state,'alice',query);
    expect(warm.mode).toBe('semantic_ai');expect(reserve).not.toHaveBeenCalled();expect(vi.mocked(model.embed).mock.calls.length).toBe(embedCalls);expect(vi.mocked(model.review).mock.calls.length).toBe(reviewCalls);
  });
});

describe('semantic safeguards',()=>{
  it('explains bare legacy tags without replacing a user-specific story meaning',()=>{
    const legacy={...story,dimension:'keyword' as const,key:'underdog',meaning:'underdog'};
    expect(semanticPreferenceMeaning(legacy)).toContain('disadvantaged');
    expect(semanticPreferenceMeaning({...legacy,meaning:'An overlooked scientist earning respect through careful experiments'})).toBe('An overlooked scientist earning respect through careful experiments');
    expect(semanticPreferenceMeaning({...story,key:'my specific story',meaning:undefined})).toBe('my specific story');
  });
  it('compact vectors preserve provider precision, accept legacy caches and reject corrupt data',()=>{
    const vector=unitVector(Array.from({length:1024},(_,i)=>Math.sin(i)))!;
    const packed=packVector(vector),restored=unpackVector(packed)!;
    expect(packed.length).toBeLessThan(JSON.stringify(vector).length*.4);
    expect(restored).toHaveLength(1024);expect(Math.max(...restored.map((n,i)=>Math.abs(n-vector[i]!)))).toBeLessThan(1e-7);
    expect(unpackVector('[1,0]')).toEqual([1,0]);expect(unpackVector('{"format":"f32le","length":99999999,"data":"AA=="}')).toBeNull();
  });
  it('keeps independent interests separate, rejects malformed vectors, does not embed famous names',()=>{
    expect(unitVector([0,0])).toBeNull();expect(unitVector([Infinity,1])).toBeNull();expect(unitVector([3,4])).toEqual([.6,.8]);
    const groups=favouriteInterests([{item:titles[0]!,vector:[1,0],reaction:'like'},{item:titles[1]!,vector:[0,1],reaction:'super_like'}]);expect(groups).toHaveLength(2);
    const text=semanticTitleText({...titles[0]!,title:'Very Famous Title',cast:['Celebrity'],popularity:999});expect(text).not.toContain('Celebrity');expect(text).not.toContain('Very Famous');
  });
  it('scoped negative story is not a dislike of every romance or country',()=>{
    const signal={...story,score:-1,conditions:[{dimension:'genre' as const,values:['Romance']},{dimension:'country' as const,values:['CN']}]};
    const interest={key:'s',label:'s',signal,vector:[1,0],strength:-1};
    expect(semanticAdjustment({...titles[0]!,genres:['Romance'],countries:['FR']},[1,0],[interest]).penalty).toBe(0);
    expect(conditionApplies({...titles[0]!,genres:['Romance'],countries:['CN']},signal)).toBe(true);
    expect(semanticAdjustment({...titles[0]!,genres:['Romance'],countries:['CN']},[1,0],[interest]).penalty).toBe(5);
  });
  const input:ReviewInput={preferences:[{key:'s',meaning:'trust',score:1}],candidates:[{key:'movie:1',overview:'Former friends repair their broken trust.',keywords:[],applicablePreferences:['s']}],context:{moods:[],keywords:[]}};
  it('requires complete unique known IDs, exact source evidence, valid scope and signed agreement',()=>{
    const good={key:'movie:1',fit:1,preferenceKey:'s',quote:'repair their broken trust'};
    expect(validateReview({items:[good]},input)).not.toBeNull();
    for(const invalid of [{items:[]},{items:[good,good]},{items:[{...good,key:'movie:999'}]},{items:[{...good,quote:'A heartwarming ending'}]},{items:[{...good,preferenceKey:'unknown'}]},{items:[{...good,fit:-1}]}])expect(validateReview(invalid,input)).toBeNull();
    expect(validateReview({items:[good]},{...input,candidates:[{...input.candidates[0]!,applicablePreferences:[]}]})).toBeNull();
  });
});
