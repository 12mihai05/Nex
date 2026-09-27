import {describe,it,expect,vi} from "vitest";
import {filterQuerySchema,type ContentItem} from "../src/domain/types.js";
import {fixtureCatalog} from "../src/fixtures/catalog.js";
import {canonicalConcept,conceptEvidence} from "../src/services/concepts.js";
import {rankCandidates,scoreCandidate} from "../src/services/recommendation.js";
import {generateCandidates} from "../src/services/candidates.js";
import {FixtureTmdbRepository} from "../src/repositories/tmdb-repository.js";
import {guardIntent} from "../src/services/intent-guards.js";
import {validateGroundedSelection} from "../src/services/grounded-selection.js";
import {detectSearchIntent} from "../src/services/intent.js";

const base:ContentItem={...fixtureCatalog[0]!,genres:[],keywords:[],moods:[],overview:"",cast:[],director:null,popularity:1};
const context={viewerIds:["test"],taste:[],temporaryMoods:[],ownedProviderIds:[],watchedIds:new Set<number>(),watchlistIds:new Set<number>()};
const query=(more:Record<string,unknown>={})=>filterQuerySchema.parse({intent:"DISCOVERY",availabilityScope:"all_providers",...more});
describe("story concepts independent of genres",()=>{
  it("Want to see is capped, stronger than seen, not additive, and disabled by privacy",()=>{
    const item={...base,genres:["Drama"]};const hint={dimension:"genre",key:"drama"};const plain=scoreCandidate(item,query(),context)!.score;
    const weak={...context,wantHints:Array(1000).fill(hint),seenHints:[hint]};
    expect(scoreCandidate(item,query(),weak)!.score-plain).toBeCloseTo(.2);
    expect(scoreCandidate(item,query(),{...weak,behaviorPersonalization:false})!.score).toBe(plain);
    const negative={...weak,taste:[{dimension:"genre",key:"drama",score:-1,confidence:.9,evidenceCount:1,source:"explicit_edit"}]};
    expect(scoreCandidate(item,query(),negative)!.evidence.some(e=>e.code==="intent:watchlist")).toBe(false);
  });
  it("seen-only affinity is small, capped and cannot cancel an explicit dislike",()=>{
    const item={...base,genres:["Drama"]};
    const hints=Array.from({length:1000},()=>({dimension:"genre",key:"drama"}));
    const plain=scoreCandidate(item,query(),context)!.score;
    const once=scoreCandidate(item,query(),{...context,seenHints:hints.slice(0,1)})!;
    const many=scoreCandidate(item,query(),{...context,seenHints:hints})!;
    expect(once.score-plain).toBeCloseTo(.12);expect(many.score).toBe(once.score);
    const liked=scoreCandidate(item,query(),{...context,taste:[{dimension:"genre",key:"drama",score:.72,confidence:.49,evidenceCount:1,source:"like"}]})!;
    expect(liked.score-plain).toBeGreaterThan((once.score-plain)*10);
    const negative={...context,seenHints:hints,taste:[{dimension:"genre",key:"drama",score:-1,confidence:.8,evidenceCount:1,source:"explicit_edit"}]};
    expect(scoreCandidate(item,query(),negative)!.evidence.some(e=>e.code==="history:weak_interest")).toBe(false);
  });
  it("rated but viewing-unknown is familiar, never a fabricated watched record",()=>{
    const state={...context,ratedKeys:new Set([`movie:${base.id}`])};
    expect(scoreCandidate(base,query(),state)).toBeNull();
    expect(scoreCandidate(base,query({excludeWatched:false}),state)).not.toBeNull();
    expect(scoreCandidate(base,query({intent:"TITLE_LOOKUP"}),state)).not.toBeNull();
    expect(state.watchedIds.size).toBe(0);
  });
  it("required concept intersections do not silently become alternatives",()=>{
    const a={...base,id:1,keywords:["underdog"]},b={...base,id:2,keywords:["time loop"]},both={...base,id:3,keywords:["underdog","time loop"]};
    expect(rankCandidates([a,b,both],query({keywords:["underdog","time loop"],keywordMatch:"all"}),context).map(r=>r.item.id)).toEqual([3]);
    expect(rankCandidates([a,b],query({keywords:["underdog","time loop"],keywordMatch:"all"}),context)).toEqual([]);
    expect(guardIntent("Both underdog and time loop in one film",query()).keywordMatch).toBe("all");
  });
  it("concept discovery search differs from an exact title lookup",()=>{
    expect(detectSearchIntent("underdog movies under 130 minutes").intent).toBe("DISCOVERY");
    expect(detectSearchIntent("movies about identity").keywords).toContain("identity");
    expect(detectSearchIntent("Underdog").intent).toBe("TITLE_LOOKUP");
  });
  it("semantic editor cannot inject IDs, invent evidence or reorder the ranking",()=>{
    const a={...base,id:1,overview:"An underdog challenges the champion."};const b={...base,id:2,keywords:["underdog"]};
    expect(validateGroundedSelection([a,b],[{key:"movie:2",evidence:"underdog"},{key:"movie:1",evidence:"challenges the champion"}])).toEqual(["movie:1","movie:2"]);
    expect(()=>validateGroundedSelection([a],[{key:"movie:9",evidence:"underdog"}])).toThrow();
    expect(()=>validateGroundedSelection([a],[{key:"movie:1",evidence:"a heartwarming family film"}])).toThrow();
    expect(validateGroundedSelection([a],[])).toEqual([]);
  });
  it("genre combinations require both genres, alternatives allow either",()=>{
    const comedy={...base,id:1,genres:["Comedy"]};const horror={...base,id:2,genres:["Horror"]};const both={...base,id:3,genres:["Comedy","Horror"]};
    expect(rankCandidates([comedy,horror,both],query({genres:["Comedy","Horror"],genreMatch:"all"}),context).map(r=>r.item.id)).toEqual([3]);
    expect(rankCandidates([comedy,horror,both],query({genres:["Comedy","Horror"],genreMatch:"any"}),context)).toHaveLength(3);
  });
  it("does not equate every outsider with an underdog",()=>{
    expect(conceptEvidence({...base,keywords:["outsider"],overview:"An outsider visits a small town."},"underdog")).toBeNull();
  });
  it("guards explicit movie/genre and removes model-invented exclusions",()=>{
    expect(guardIntent("Recommend movies. Some rated films might already be seen.",query({excludeWatched:false})).excludeWatched).toBe(true);
    const guarded=guardIntent("An underdog comedy movie, not sport",query({mediaType:"any",genres:[],keywords:["underdog","comedy"],excludedKeywords:["sport","gore","war"],excludeWatched:false}));
    expect(guarded.mediaType).toBe("movie");expect(guarded.genres).toEqual(["comedy"]);
    expect(guarded.keywords).toEqual(["underdog"]);expect(guarded.excludedKeywords).toEqual(["sport"]);expect(guarded.excludeWatched).toBe(true);
  });
  it("a concept does not authorize inferred genres",()=>{
    expect(guardIntent("Japanese live-action movies about friendship",query({genres:["action"]})).genres).toEqual([]);
    expect(guardIntent("Underdog movies, any genre",query({genres:["Action","Drama"]})).genres).toEqual([]);
    expect(guardIntent("Science fiction movies about found family",query({genres:["Family","Science Fiction"]})).genres).toEqual(["science fiction"]);
    expect(guardIntent("Science fiction movies about found family",query()).keywords).toEqual(["found family"]);
  });
  it("plural genre names and negated concepts retain their meaning",()=>{
    const guarded=guardIntent("Nature documentaries, not celebrity stories or concerts",query({genres:[],keywords:["nature"],excludedKeywords:[]}));
    expect(guarded.genres).toEqual(["documentary"]);expect(guarded.excludedKeywords).toEqual(expect.arrayContaining(["celebrity","concert"]));
  });
  it("examples in prompts cannot broaden an explicit concept request",()=>{
    expect(guardIntent("Underdog comedy movies",query({keywords:["underdog","redemption","found family","teamwork"]})).keywords).toEqual(["underdog"]);
    expect(guardIntent("Time loops instead, same time limit",query({keywords:["underdog","time loop"]}),query({keywords:["underdog"]})).keywords).toEqual(["time loop"]);
  });
  for(const concept of ["underdog","redemption","found family","time loop","identity","memory","moral dilemma","class conflict","nature","ocean","friendship","teamwork","survival","conspiracy","heist","journalism","cooking","loneliness","coming of age","revenge"]){
    it(`${concept}: a supported concept outranks unrelated popularity in multiple genres`,()=>{
      const drama={...base,id:1,genres:["Drama"],keywords:[concept]};
      const comedy={...base,id:2,genres:["Comedy"],keywords:[concept]};
      const famous={...base,id:3,popularity:999,rating:10,voteCount:10000,genres:["Action"]};
      const ranked=rankCandidates([famous,drama,comedy],query({keywords:[concept]}),context);
      expect(new Set(ranked.map(r=>r.item.id))).toEqual(new Set([1,2]));
      expect(ranked.every(r=>r.evidence.some(e=>e.code==="session:concept"))).toBe(true);
    });
  }
  it("underdog + comedy + no sport + runtime are respected together",()=>{
    const comedy={...base,id:1,keywords:["underdog"],genres:["Comedy"],runtimeMinutes:95};
    const drama={...comedy,id:2,genres:["Drama"]};
    const sport={...comedy,id:3,keywords:["underdog","boxing"]};
    const long={...comedy,id:4,runtimeMinutes:180};
    expect(rankCandidates([sport,long,drama,comedy],query({keywords:["underdog"],genres:["Comedy"],excludedKeywords:["sport"],maxRuntimeMinutes:100}),context).map(r=>r.item.id)).toEqual([1]);
  });
  it("concept exclusion does not require a matching genre tag",()=>{
    expect(scoreCandidate({...base,overview:"A boxer becomes an unlikely champion."},query({excludedKeywords:["underdog"]}),context)).toBeNull();
  });
  it("premise matches are distinct from tags and do not match substrings",()=>{
    expect(conceptEvidence({...base,overview:"A reporter uncovers corruption."},"journalism")).toBe("premise");
    expect(conceptEvidence({...base,overview:"A reward for an airman."},"war")).toBeNull();
    expect(canonicalConcept("second chances")).toBe("redemption");
  });
  it("unknown mood/safety is not invented",()=>{
    expect(conceptEvidence({...base,genres:["Comedy"]},"family safe")).toBeNull();
    expect(conceptEvidence({...base,genres:["Horror"]},"gore")).toBeNull();
  });
  it("explicit original language is a hard constraint, unknown is not accepted",()=>{
    const ja={...base,id:1,originalLanguage:"ja"};
    expect(rankCandidates([ja,{...base,id:2,originalLanguage:"en"},{...base,id:3,originalLanguage:null}],query({originalLanguages:["ja"]}),context).map(r=>r.item.id)).toEqual([1]);
  });
  it("negative concept preference penalizes a supported topic without banning genres",()=>{
    const taste=[{dimension:"keyword",key:"torture",score:-1,confidence:.9,evidenceCount:2,source:"explicit_edit"}];
    const safe={...base,id:1,genres:["Thriller"]};
    const torture={...safe,id:2,keywords:["torture"]};
    expect(rankCandidates([torture,safe],query(),{...context,taste})[0]!.item.id).toBe(1);
    expect(scoreCandidate({...base,keywords:["extreme violence"]},query({excludedKeywords:["gore"]}),context)).toBeNull();
  });
  it("multiple independent tastes each contribute without requiring their intersection",()=>{
    const taste=["underdog","time loop"].map(key=>({dimension:"keyword",key,score:1,confidence:.8,evidenceCount:1,source:"explicit_edit"}));
    for(const keyword of ["underdog","time loop"]){
      const scored=scoreCandidate({...base,keywords:[keyword]},query(),{...context,taste})!;
      expect(scored.evidence.some(e=>e.code==="taste:keyword")).toBe(true);
    }
  });
  it("broad Browse diversifies supported interests rather than repeating one concept",()=>{
    const taste=[{dimension:"keyword",key:"underdog",score:.7,confidence:.8,evidenceCount:1,source:"explicit_edit"},{dimension:"keyword",key:"nature",score:.6,confidence:.8,evidenceCount:1,source:"explicit_edit"}];
    const items=[{...base,id:1,genres:["Action"],keywords:["underdog"]},{...base,id:2,genres:["Comedy"],keywords:["underdog"]},{...base,id:3,genres:["Documentary"],keywords:["nature"]}];
    expect(rankCandidates(items,query(),{...context,taste},2).map(r=>r.item.id)).toEqual([1,3]);
  });
  it("explicit topic pools do not inherit background genre restrictions",async()=>{
    const catalog=new FixtureTmdbRepository();const spy=vi.spyOn(catalog,"discover");
    const state:any={...context,country:"RO",favorites:[],saved:[],taste:[{dimension:"genre",key:"horror",score:1,confidence:.8}]};
    await generateCandidates(catalog,state,query({keywords:["underdog"]}));
    const topicCalls=spy.mock.calls.filter(([o])=>o.keywords?.length);
    expect(topicCalls.length).toBeGreaterThan(0);expect(topicCalls.every(([o])=>!o.genres?.length)).toBe(true);
  });
});
