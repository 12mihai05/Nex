import { describe, expect, it } from "vitest";
import { fixtureCatalog } from "../src/fixtures/catalog.js";
import { filterQuerySchema, type ContentItem, type TasteSignal } from "../src/domain/types.js";
import { rankCandidates, scoreCandidate, type RecommendationContext } from "../src/services/recommendation.js";
import { aggregateEvidence, signalStrength, type TasteEvidence } from "../src/services/taste.js";

const query=()=>filterQuerySchema.parse({intent:"DISCOVERY",availabilityScope:"all_providers"});
const context=(taste:TasteSignal[]=[]):RecommendationContext=>({viewerIds:["u"],taste,temporaryMoods:[],ownedProviderIds:[8],watchedIds:new Set(),watchlistIds:new Set()});
const item=(id:number,genres:string[],extra:Partial<ContentItem>={}):ContentItem=>({...fixtureCatalog[0]!,id,genres,moods:[],keywords:[],cast:[],director:null,availability:[],popularity:0,...extra});
const signal=(key:string,score:number,confidence=.9):TasteSignal=>({dimension:"genre",key,score,confidence,evidenceCount:1,source:"explicit_edit"});
const evidence=(source:string,score:number,weight:number,days=0):TasteEvidence=>({id:source,source,score,weight,explicit:source==="explicit_edit",at:new Date(Date.now()-days*86_400_000).toISOString()});
describe("Phase 15 recommendation behavior",()=>{
  it("strong explicit preference beats a weak search",()=>{
    const strong=aggregateEvidence("genre","drama",[evidence("explicit_edit",1,3)]);
    const weak=aggregateEvidence("genre","comedy",[evidence("search",1,.015)]);
    expect(rankCandidates([item(1,["drama"]),item(2,["comedy"])],query(),context([strong,weak]))[0]?.item.id).toBe(1);
  });
  it("dislikes suppress related titles",()=>{ expect(rankCandidates([item(1,["music"]),item(2,["drama"])],query(),context([signal("music",-1)]))[0]?.item.id).toBe(2); });
  it("watchlist learning is weaker than explicit liking",()=>{
    const saved=aggregateEvidence("genre","drama",[evidence("watchlist",.35,.35)]);
    const liked=aggregateEvidence("genre","drama",[evidence("like",.72,1.3)]);
    expect(liked.score*liked.confidence).toBeGreaterThan(saved.score*saved.confidence);
  });
  it("watched alone is neutral",()=>expect(signalStrength.watched).toBe(0));
  it("temporary mood affects ranking without changing taste",()=>{
    const ctx=context([signal("drama",1)]); const original=structuredClone(ctx.taste); ctx.temporaryMoods=["light"];
    expect(rankCandidates([item(1,["drama"]),item(2,["comedy"],{moods:["light"]})],query(),ctx)[0]?.item.id).toBe(2); expect(ctx.taste).toEqual(original);
  });
  it("included availability is practical ranking evidence",()=>{
    const available=item(2,["drama"],{availability:[{providerId:8,providerName:"Netflix",logoUrl:null,access:"included",owned:false}]});
    expect(rankCandidates([item(1,["drama"]),available],query(),context())[0]?.item.id).toBe(2);
  });
  it("exact lookup includes unowned and watched titles",()=>{
    const q=query(); q.intent="TITLE_LOOKUP"; q.availabilityScope="owned_services"; const ctx=context(); ctx.watchedIds.add(1);
    expect(scoreCandidate(item(1,["drama"]),q,ctx)).not.toBeNull();
  });
  it("recent rejection prevents reappearance",()=>{
    expect(rankCandidates([item(1,["drama"])],query(),{...context(),rejectedKeys:new Set(["movie:1"])})).toHaveLength(0);
  });
  it("diversifies within the valid genre constraint",()=>{
    const q=query(); q.genres=["horror"];
    const result=rankCandidates([item(1,["horror"]),item(2,["horror"]),item(3,["horror","mystery"]),item(4,["comedy"])],q,context(),3);
    expect(result.map((r)=>r.item.id)).toEqual([1,3,2]);
  });
  it("high confidence matters more",()=>{
    expect(rankCandidates([item(1,["drama"]),item(2,["comedy"])],query(),context([signal("drama",1,.1),signal("comedy",1,.9)]))[0]?.item.id).toBe(2);
  });
  it("old inferred behavior decays",()=>{
    expect(aggregateEvidence("genre","drama",[evidence("watchlist",.35,.35,180)]).confidence).toBeLessThan(aggregateEvidence("genre","drama",[evidence("watchlist",.35,.35)]).confidence);
  });
  it("explicit correction overrides old inference",()=>{
    const s=aggregateEvidence("genre","music",[evidence("like",1,10,2),evidence("explicit_edit",-1,3)]); expect(s.score).toBe(-1);
  });
  it("recent impressions penalize without permanently hiding a title",()=>{
    const rows=rankCandidates([item(1,["drama"]),item(2,["drama"])],query(),{...context(),recentlyShown:new Map([["movie:1",Date.now()]])}); expect(rows.map((r)=>r.item.id)).toEqual([2,1]);
  });
  it("movie and series identifiers cannot collide",()=>{
    const rows=rankCandidates([item(1,["drama"]),item(1,["drama"],{mediaType:"series"})],query(),{...context(),watchedKeys:new Set(["movie:1"])}); expect(rows).toHaveLength(1); expect(rows[0]?.item.mediaType).toBe("series");
  });
});
