import { describe,it,expect } from "vitest";
import { tvWindow } from "../src/services/tv-window.js";
import { settingsBodySchema } from "../src/http/schemas.js";
import { detectSearchIntent, fallbackIntent } from "../src/services/intent.js";
import { contentTraits } from "../src/services/content-traits.js";
import { fixtureCatalog } from "../src/fixtures/catalog.js";
import { filterQuerySchema } from "../src/domain/types.js";
import { rankCandidates, scoreCandidate } from "../src/services/recommendation.js";
import { explicitCountry } from "../src/services/country-context.js";
import {AiService} from "../src/services/ai.js";
import {completeIntro,addSuitabilityCaution} from "../src/services/composition-intro.js";

describe("user journey regressions",()=>{
  it("adds the suitability uncertainty even when AI prose omits it",()=>{
    expect(addSuitabilityCaution("Some eerie picks.","No gore or torture",true)).toContain("cannot guarantee");
    expect(addSuitabilityCaution("No matches.","No gore",false)).toBe("No matches.");
    expect(addSuitabilityCaution("Cannot guarantee suitability.","No gore",true)).toBe("Cannot guarantee suitability.");
  });
  it("replacing the topic with a genre drops stale concepts but preserves the requested time limit",()=>{
    const previous=filterQuerySchema.parse({intent:"DISCOVERY",keywords:["cooking","friendship"],maxRuntimeMinutes:100});
    const next=fallbackIntent("Actually make it a tense mystery instead, keep the time limit.",previous);
    expect(next.keywords).toEqual([]);expect(next.genres).toEqual(["mystery"]);expect(next.maxRuntimeMinutes).toBe(100);
    expect(fallbackIntent("A comedy instead, keep the same story concept",previous).keywords).toEqual(previous.keywords);
  });
  it("never displays a mid-sentence structured-output intro",()=>{
    expect(completeIntro("Here are Japanese-language movies: A (120 minutes), B (",true)).toBe("Here are the catalog candidates I found for this request.");
    expect(completeIntro("Here are the catalog candidates matching your request. A further unfinished",true)).toBe("Here are the catalog candidates matching your request.");
    expect(completeIntro("A concise introduction.",true)).toBe("A concise introduction.");
    expect(completeIntro("",false)).toContain("couldn't confirm");
  });
  it("AI outage never converts missing free-text interpretation into guessed positive taste",async()=>{
    const result=await new AiService("").extractTaste("I don't enjoy gore but love underdogs",[]);
    expect(result.mode).toBe("fallback");expect(result.signals).toEqual([]);
  });
  it("service failure retains combined concepts, synonyms, language and conflicting bounds",()=>{
    const combined=fallbackIntent("Movie combining both underdog and time loop under two hours");
    expect(combined.keywordMatch).toBe("all");expect(combined.maxRuntimeMinutes).toBe(120);
    const excluded=fallbackIntent("Psychological thriller movies without graphic violence");
    expect(excluded.excludedKeywords).toContain("gore");expect(excluded.keywords).not.toContain("gore");
    const japanese=fallbackIntent("Only Japanese-language live-action movies, no animation");
    expect(japanese.originalLanguages).toEqual(["ja"]);expect(japanese.genres).toEqual([]);
    expect(fallbackIntent("A movie under 60 minutes but at least 180 minutes").minRuntimeMinutes).toBe(180);
  });
  it("AI failure preserves explicit runtime/provider constraints and follow-ups",()=>{
    const first=fallbackIntent("Recommend comedy movies on Netflix under 100 minutes");
    expect(first.intent).toBe("DISCOVERY");expect(first.mediaType).toBe("movie");
    const next=fallbackIntent("Other options under 90 minutes",first);
    expect(next.maxRuntimeMinutes).toBe(90);expect(next.providerIds).toEqual([8]);expect(next.genres).toEqual(["comedy"]);
  });
  it("country overrides require an explicit region request",()=>{
    expect(explicitCountry("What is on TV in France tomorrow?")).toBe("FR");
    expect(explicitCountry("Show British TV tonight")).toBe("GB");
    expect(explicitCountry("I enjoy French films")).toBeNull();
    expect(explicitCountry("What should I watch tonight?")).toBeNull();
  });
  it("an additional supported preference cannot lower the base score",()=>{
    const item={...fixtureCatalog[0]!,genres:["Documentary"],keywords:["nature"],moods:[],cast:[],director:null};
    const taste=[{dimension:"genre",key:"documentary",score:1,confidence:.8,evidenceCount:1,source:"explicit_edit"}];
    const ctx={viewerIds:["u"],taste,temporaryMoods:[],ownedProviderIds:[],watchedIds:new Set<number>(),watchlistIds:new Set<number>()};
    const q=filterQuerySchema.parse({intent:"DISCOVERY",availabilityScope:"all_providers"});
    const before=scoreCandidate(item,q,ctx)!.score;
    ctx.taste.push({...taste[0]!,dimension:"keyword",key:"nature",confidence:.6});
    expect(scoreCandidate(item,q,ctx)!.score).toBeGreaterThan(before);
  });
  it("strips the question from availability search",()=>expect(detectSearchIntent("Where can I watch Arrival?").query).toBe("Arrival"));
  it("rejects invalid countries and timezones",()=>{
    expect(settingsBodySchema.safeParse({country:"XX"}).success).toBe(false);
    expect(settingsBodySchema.safeParse({timezone:"fake/zone"}).success).toBe(false);
    expect(settingsBodySchema.safeParse({country:"RO",timezone:"Europe/Bucharest"}).success).toBe(true);
  });
  it("uses the viewer timezone for tomorrow and handles DST",()=>{
    const window=tvWindow("tomorrow","Europe/Bucharest",new Date("2026-10-24T12:00:00Z"));
    expect(window.start.toISOString()).toBe("2026-10-24T21:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-10-25T22:00:00.000Z");
  });
  it("tonight starts at 18:00 local, or now if later",()=>{
    const window=tvWindow("tonight","Europe/Bucharest",new Date("2026-09-26T12:00:00Z"));
    expect(window.start.toISOString()).toBe("2026-09-26T15:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-09-26T21:00:00.000Z");
  });
  it("does not infer comforting or family-safe from comedy alone",()=>{
    const traits=contentTraits({...fixtureCatalog[0]!,genres:["Comedy"],moods:[],keywords:[]});
    expect(traits.has("funny")).toBe(true);expect(traits.has("cozy")).toBe(false);expect(traits.has("light")).toBe(false);
  });
  it("fame is neither a hard exclusion nor enough to beat meaningful taste",()=>{
    const known={...fixtureCatalog[0]!,id:1,popularity:1000,genres:["Drama"],moods:[],keywords:[],cast:[],director:null};
    const adjacent={...known,id:2,popularity:1,genres:["Mystery"]};
    const result=rankCandidates([known,adjacent],filterQuerySchema.parse({intent:"DISCOVERY",availabilityScope:"all_providers"}),{viewerIds:["u"],taste:[{dimension:"genre",key:"mystery",score:1,confidence:.9,evidenceCount:3,source:"explicit_edit"}],temporaryMoods:[],ownedProviderIds:[],watchedIds:new Set(),watchlistIds:new Set()});
    expect(result.map(r=>r.item.id)).toEqual([2,1]);
  });
});
