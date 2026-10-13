import type { ContentItem, FilterQuery, RecommendationEvidence } from '../domain/types.js';
import type { UserRepository } from '../repositories/user-repository.js';
import type { SemanticStore } from '../repositories/recommendation-store.js';
import type { TmdbRepository } from '../repositories/tmdb-repository.js';
import { getConfig } from '../config.js';
import {representativeFavorites} from './interest-coverage.js';
import { rankCandidates, titleKey } from './recommendation.js';
import { OpenAiSemanticModel, shortlistReviewSchema, type SemanticModel, type ReviewInput } from './semantic-model.js';
import { conditionApplies, favouriteInterests, semanticAdjustment, semanticHash, semanticSignals, semanticTitleText, semanticPreferenceMeaning, unitVector, type Interest } from './semantic-taste.js';

export type PersonalizationState = Awaited<ReturnType<UserRepository['getRecommendationState']>>;
export interface PreparedPersonalization {
  personalAdjustments: Map<string, RecommendationEvidence[]>;
  mode: 'baseline'|'semantic'|'semantic_ai';
  reason: 'selected'|'no_evidence'|'unavailable'|'budget'|'review_fallback';
  embedded: number;
  cacheHits: number;
  covered: number;
}

// Strict server-side grounding: a valid JSON shape alone is not evidence.
export function validateReview(value: unknown, input: ReviewInput) {
  const parsed = shortlistReviewSchema.safeParse(value);
  if (!parsed.success || parsed.data.items.length !== input.candidates.length) return null;
  const seen = new Set<string>();
  for (const row of parsed.data.items) {
    const candidate = input.candidates.find(c => c.key === row.key);
    if (!candidate || seen.has(row.key)) return null;
    seen.add(row.key);
    if (!row.fit) { if (row.preferenceKey !== null || row.quote !== null) return null; continue; }
    const preference = input.preferences.find(p => p.key === row.preferenceKey);
    if (!preference || Math.sign(preference.score) !== Math.sign(row.fit) || !candidate.applicablePreferences.includes(preference.key)) return null;
    if (!row.quote?.trim() || row.quote.trim().length < 4 || ![candidate.overview, ...candidate.keywords].some(text => text.toLowerCase().includes(row.quote!.toLowerCase()))) return null;
  }
  return parsed.data;
}

export class PersonalizationService {
  private readonly pending = new Map<string, Promise<PreparedPersonalization>>();
  constructor(private readonly store: SemanticStore, private readonly catalog: TmdbRepository,
    private readonly reserve: (userId: string) => Promise<boolean>, private readonly model: SemanticModel = new OpenAiSemanticModel()) {}

  prepare(items: ContentItem[], state: PersonalizationState, userId: string, query: FilterQuery): Promise<PreparedPersonalization> {
    // Coalesce only identical user-owned requests; never cross user boundaries.
    const key = semanticHash([userId, this.model.version, {...state,taste:state.taste.map(s=>({...s,updatedAt:undefined}))}, query, items]);
    const pending = this.pending.get(key);
    if (pending) return pending;
    const work = this.compute(items, state, userId, query).finally(() => this.pending.delete(key));
    this.pending.set(key, work);
    return work;
  }

  private async compute(items: ContentItem[], state: PersonalizationState, userId: string, query: FilterQuery): Promise<PreparedPersonalization> {
    const result: PreparedPersonalization = {personalAdjustments: new Map(), mode:'baseline', reason:'selected', embedded:0, cacheHits:0, covered:0};
    if (!state.recommendationEngine || state.recommendationEngine === 'baseline' || ['TITLE_LOOKUP','AVAILABILITY_LOOKUP'].includes(query.intent)) return result;
    const signals = semanticSignals(state.taste);
    if (!signals.length && !state.favorites.length) return {...result, reason:'no_evidence'};
    if (!this.model.available) return {...result, reason:'unavailable'};
    let reserved = false;
    let denied = false;
    const permit = async () => {
      if (reserved) return true;
      if (denied) return false;
      reserved = await this.reserve(userId); denied = !reserved;
      return reserved;
    };
    try {
      const preferenceDocs=signals.map(s=>({signal:s,text:`Story preference: ${semanticPreferenceMeaning(s)}`}));
      // Validate the exact current private profile before loading large public
      // vector batches. Changed/removed interests cannot reuse an old profile.
      const profileKey=`interests:${semanticHash([this.model.version,preferenceDocs.map(d=>d.text)])}`;
      const privateRaw = preferenceDocs.length ? await this.store.privateValue(userId,profileKey) : [];
      let preferenceVectors = Array.isArray(privateRaw) ? privateRaw.map(unitVector) : [];
      if(preferenceVectors.length!==preferenceDocs.length || preferenceVectors.some(v=>!v)) {
        if(!await permit()) return {...result, reason:'budget'};
        preferenceVectors=(await this.model.embed(preferenceDocs.map(d=>d.text))).map(unitVector);
        if(preferenceVectors.length!==preferenceDocs.length || preferenceVectors.some(v=>!v)) throw new Error('INVALID_PROFILE_VECTORS');
        await this.store.putPrivate(userId,profileKey,preferenceVectors); result.embedded+=preferenceVectors.length;
      }
      const seeds = representativeFavorites(state.favorites,items,8);
      const examples: Array<{item: ContentItem; reaction: string}> = [];
      for(let i=0;i<seeds.length;i+=4) {
        const found = await Promise.allSettled(seeds.slice(i,i+4).map(async seed => ({item: items.find(t=>t.id===seed.tmdbId&&t.mediaType===seed.mediaType) ?? await this.catalog.getTitle(seed.mediaType,seed.tmdbId,state.country,[]),reaction:seed.reaction})));
        for(const r of found) if(r.status==='fulfilled'&&r.value.item) examples.push({item:r.value.item,reaction:r.value.reaction});
      }
      // Bounded per-request work, not a cap on the user's stored Taste or catalog.
      const pool = [...new Map([...items.slice(0,384),...examples.map(e=>e.item)].map(t=>[titleKey(t),t])).values()];
      const docs = pool.map(item=>({item,text:semanticTitleText(item),key:`title:${semanticHash([this.model.version,semanticTitleText(item)])}`}));
      const cached = await this.store.publicVectors(docs.map(d=>d.key));
      const vectors = new Map<string,number[]>();
      for(const [key,value] of cached) { const vector=unitVector(value); if(vector) vectors.set(key,vector); }
      const missing = [...new Map(docs.filter(d=>!vectors.has(d.key)).map(d=>[d.key,d])).values()];
      result.cacheHits = docs.length - missing.length;
      // Quota governs new paid calls, not reuse of verified cached evidence.
      const canEmbed = missing.length > 0 && await permit();
      if (missing.length && !canEmbed) result.reason = 'budget';
      for(let i=0;canEmbed && i<missing.length;i+=128) {
        const batch=missing.slice(i,i+128), raw=await this.model.embed(batch.map(d=>d.text));
        const valid=raw.map(unitVector);
        if(raw.length!==batch.length || valid.some(v=>!v) || new Set(valid.map(v=>v!.length)).size!==1) throw new Error('INVALID_VECTORS');
        const entries=batch.map((d,index)=>({key:d.key,vector:valid[index]!}));
        await this.store.putPublic(entries);
        entries.forEach(e=>vectors.set(e.key,e.vector)); result.embedded+=entries.length;
      }
      const interests: Interest[] = preferenceDocs.map((d,i)=>({key:`${d.signal.dimension}:${d.signal.key}`,label:d.signal.key,signal:d.signal,vector:preferenceVectors[i]!,strength:d.signal.score*d.signal.confidence}));
      const vectorFor=(item:ContentItem)=>vectors.get(`title:${semanticHash([this.model.version,semanticTitleText(item)])}`);
      interests.push(...favouriteInterests(examples.flatMap(e=>{const vector=vectorFor(e.item);return vector?[{...e,vector}]:[];})));
      if (!interests.length || !vectors.size) return {...result,reason:denied?'budget':'no_evidence'};
      const dimensions=new Set([...vectors.values(),...interests.map(i=>i.vector)].map(v=>v.length));
      if(dimensions.size>1) throw new Error('VECTOR_DIMENSION_MISMATCH');
      for(const item of items) {
        const vector=vectorFor(item); if(!vector) continue;
        const adjustment=semanticAdjustment(item,vector,interests), evidence: RecommendationEvidence[]=[];
        if(adjustment.boost>.05) evidence.push({code:'semantic:interest',label:'its premise is related to your interests',weight:adjustment.boost});
        if(adjustment.penalty>.05) evidence.push({code:'semantic:avoid',label:'its premise may overlap with something you dislike',weight:-adjustment.penalty});
        result.personalAdjustments.set(titleKey(item),evidence); result.covered++;
      }
      result.mode='semantic';
      if(state.recommendationEngine!=='semantic_ai'||!signals.length) return result;
      const shortlist=rankCandidates(items,query,{...state,...result,viewerIds:[userId],temporaryMoods:query.moods},8);
      if(!shortlist.length) return result;
      const input:ReviewInput={preferences:signals.map(s=>({key:`${s.dimension}:${s.key}`,meaning:semanticPreferenceMeaning(s),score:s.score*s.confidence})),
        candidates:shortlist.map(({item})=>({key:titleKey(item),overview:item.overview.slice(0,1600),keywords:item.keywords.slice(0,30),applicablePreferences:signals.filter(s=>conditionApplies(item,s)).map(s=>`${s.dimension}:${s.key}`)})),context:{moods:query.moods,keywords:query.keywords}};
      const reviewKey=`review:${semanticHash([this.model.version,input])}`;
      let review=validateReview(await this.store.privateValue(userId,reviewKey),input);
      if(!review) {
        if(!await permit()) return {...result,reason:'budget'};
        review=validateReview(await this.model.review(input),input);
        if(!review) return {...result,reason:'review_fallback'};
        await this.store.putPrivate(userId,reviewKey,review);
      }
      for(const r of review.items) {
        if(!r.fit) continue;
        result.personalAdjustments.get(r.key)?.push({code:'semantic:review',label:r.fit>0?'the supplied premise supports a stated interest':'the supplied premise conflicts with a stated preference',weight:r.fit*1.5});
      }
      return {...result,mode:'semantic_ai'};
    } catch {
      // No raw provider exception is logged: it can contain private request data.
      return result.mode==='baseline' ? {...result,reason:'unavailable'} : {...result,reason:'review_fallback'};
    }
  }
}

const services = new WeakMap<UserRepository,WeakMap<TmdbRepository,PersonalizationService>>();
export function personalizationFor(users: UserRepository, catalog: TmdbRepository) {
  let catalogs=services.get(users);
  if(!catalogs){catalogs=new WeakMap();services.set(users,catalogs);}
  let service=catalogs.get(catalog);
  if(!service){service=new PersonalizationService(users.recommendationStore(),catalog,userId=>users.incrementAiUsage(userId,getConfig().RECOMMENDATION_AI_DAILY_LIMIT,new Date(),'recommendation'));catalogs.set(catalog,service);}
  return service;
}
