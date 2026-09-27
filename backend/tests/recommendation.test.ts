import { describe, expect, it } from "vitest";
import { fixtureCatalog } from "../src/fixtures/catalog.js";
import { detectSearchIntent } from "../src/services/intent.js";
import { rankCandidates, signalStrength, updateTasteSignal } from "../src/services/recommendation.js";

const context = {
  viewerIds: ["u1"],
  taste: [{ dimension: "mood", key: "cerebral", score: 0.95, confidence: 0.9, evidenceCount: 8, source: "explicit" }],
  temporaryMoods: [] as string[],
  ownedProviderIds: [8, 1899, 119],
  watchedIds: new Set<number>(),
  watchlistIds: new Set<number>(),
};

describe("recommendation scoring", () => {
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
