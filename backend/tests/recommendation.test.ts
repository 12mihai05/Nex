import { describe, expect, it } from "vitest";
import { fixtureCatalog } from "../src/fixtures/catalog.js";
import { detectSearchIntent } from "../src/services/intent.js";
import { rankCandidates, signalStrength, updateTasteSignal, recommendationReason } from "../src/services/recommendation.js";

const context = {
  viewerIds: ["u1"],
  taste: [{ dimension: "mood", key: "cerebral", score: 0.95, confidence: 0.9, evidenceCount: 8, source: "explicit" }],
  temporaryMoods: [] as string[],
  ownedProviderIds: [8, 1899, 119],
  watchedIds: new Set<number>(),
  watchlistIds: new Set<number>(),
};

describe("recommendation scoring", () => {
  it('explains personal matches before availability and discloses conflicts',()=>{
    const reason=recommendationReason([
      {code:'availability:owned',label:'included with Prime',weight:3},
      {code:'taste:genre',label:'sports fits your taste',weight:2},
      {code:'semantic:interest',label:'its premise may appeal to your interest in second chances',weight:1},
      {code:'negative:mood',label:'less aligned with your preference about violence',weight:-2},
    ]);
    expect(reason).toContain('second chances');expect(reason).toContain('possible mismatch');
    expect(reason.indexOf('second chances')).toBeLessThan(reason.indexOf('Prime'));
    expect(recommendationReason([{code:'availability:owned',label:'included with Prime',weight:3}])).toContain('rather than a strong match');
  });
  it('does not substitute unrelated titles when no candidate supports the requested concept',()=>{
    const query={...detectSearchIntent('recommend a movie'),keywords:['nonexistent verified story concept']};
    expect(rankCandidates(fixtureCatalog,query,context)).toEqual([]);
  });
  it('explicit Korean-language dislike lowers otherwise equivalent movies and series without banning exact lookup',()=>{
    for(const mediaType of ['movie','series'] as const){
      const base={...fixtureCatalog[0]!,mediaType,genres:[],keywords:[],moods:[],countries:[]};
      const korean={...base,id:7001,title:'Korean candidate',originalLanguage:'ko'};
      const english={...base,id:7002,title:'English candidate',originalLanguage:'en'};
      const withDislike={...context,taste:[{dimension:'language',key:'ko',score:-.9,confidence:.75,evidenceCount:1,source:'chat_explicit'}]};
      const ranked=rankCandidates([korean,english],detectSearchIntent('what should I watch?'),withDislike);
      expect(ranked[0]?.item.id).toBe(7002);
      expect(ranked.find(r=>r.item.id===7001)?.evidence.some(e=>e.code==='negative:language')).toBe(true);
      expect(rankCandidates([korean],detectSearchIntent('Korean candidate'),withDislike)).toHaveLength(1);
    }
  });
  it("prioritizes strong taste and owned included availability", () => {
    const ranked = rankCandidates(fixtureCatalog, detectSearchIntent("what should I watch?"), context);
    expect(ranked[0]?.item.moods).toContain("cerebral");
    expect(ranked[0]?.evidence.some((entry) => entry.code === "availability:owned")).toBe(true);
    expect(ranked[0]?.reason).toContain("fits your taste");
  });

  it("applies temporary mood without mutating persistent taste", () => {
    const original = structuredClone(context.taste);
    const ranked = rankCandidates(fixtureCatalog, detectSearchIntent("something funny tonight"), { ...context, temporaryMoods: ["funny"] });
    expect(ranked.some((entry) => entry.evidence.some((evidence) => evidence.code === "session:mood"))).toBe(true);
    expect(context.taste).toEqual(original);
  });

  it("weights explicit feedback far above search", () => {
    expect(signalStrength.super_like).toBeGreaterThan(signalStrength.watchlist);
    expect(signalStrength.watchlist).toBeGreaterThan(signalStrength.search * 10);
    const searched = updateTasteSignal(undefined, signalStrength.search, "search");
    const explicit = updateTasteSignal(undefined, signalStrength.super_like, "super_like");
    expect(explicit.confidence).toBeGreaterThan(searched.confidence * 5);
  });

  it("filters watched titles and rejected surprise IDs through candidate input", () => {
    const ranked = rankCandidates(fixtureCatalog, detectSearchIntent("what should I watch?"), { ...context, watchedIds: new Set([329865]) });
    expect(ranked.some((entry) => entry.item.id === 329865)).toBe(false);
  });
});
