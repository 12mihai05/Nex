import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "../src/db/schema.js";
import { UserRepository } from "../src/repositories/user-repository.js";
import { fixtureCatalog } from "../src/fixtures/catalog.js";
import {ChatService} from "../src/services/chat.js";
import {AiService} from "../src/services/ai.js";
import {TasteSummary} from '../src/services/taste-summary.js';
import {FixtureTmdbRepository} from "../src/repositories/tmdb-repository.js";
import {filterQuerySchema} from "../src/domain/types.js";

describe("user ownership isolation", () => {
  it('legacy history gets cached artwork in one read without leaking other histories',async()=>{
    const db=drizzle(client,{schema});
    const item={...fixtureCatalog[0]!,posterUrl:null};
    await repository.markWatched('alice',item);
    await db.insert(schema.tmdbCache).values({cacheKey:`title:${item.mediaType}:${item.id}:RO`,kind:'title',payloadJson:JSON.stringify({...item,posterUrl:'https://image.tmdb.org/t/p/w500/legacy.jpg'}),expiresAt:new Date(0)});
    expect((await repository.listHistory('alice'))[0]!.posterPath).toBe('https://image.tmdb.org/t/p/w500/legacy.jpg');
    expect(await repository.listHistory('bob')).toEqual([]);
    await repository.markWatched('alice',{...item,posterUrl:'https://image.tmdb.org/t/p/w500/saved.jpg'});
    expect((await repository.listHistory('alice'))[0]!.posterPath).toContain('saved.jpg');
  });
  it('summary reads are free, generations are daily and isolated, and deletion cascades',async()=>{
    const db=drizzle(client,{schema});
    const ai=new AiService('');
    const generate=vi.spyOn(ai,'structured').mockResolvedValue({paragraph:'You enjoy thoughtful science fiction and character-led stories, while preferring less horror.'});
    const summary=new TasteSummary(db,repository,ai);
    await repository.upsertTaste('alice',[{dimension:'genre',key:'science fiction',score:.9,confidence:1,evidenceCount:1,source:'chat_explicit'}]);
    expect((await summary.read('alice')).paragraph).toBeNull();expect(generate).not.toHaveBeenCalled();
    const now=new Date();await Promise.all([summary.generate('alice',now),summary.generate('alice',now)]);expect(generate).toHaveBeenCalledTimes(1);
    expect((await summary.read('bob')).paragraph).toBeNull();
    await repository.upsertTaste('alice',[{dimension:'genre',key:'horror',score:-.9,confidence:1,evidenceCount:1,source:'chat_explicit'}]);
    await summary.generate('alice',new Date(+now+1000));expect(generate).toHaveBeenCalledTimes(1);
    await summary.generate('alice',new Date(+now+86400001));expect(generate).toHaveBeenCalledTimes(2);
    await summary.generate('alice',new Date(+now+2*86400000));expect(generate).toHaveBeenCalledTimes(2);
    await client.execute("DELETE FROM user WHERE id='alice'");
    expect((await summary.read('alice')).paragraph).toBeNull();
  });
  let client: ReturnType<typeof createClient>;
  let repository: UserRepository;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    for (const name of (await readdir(fileURLToPath(new URL("../drizzle/",import.meta.url)))).filter((n)=>n.endsWith(".sql")).sort()) {
      const migration = await readFile(fileURLToPath(new URL(`../drizzle/${name}`,import.meta.url)),"utf8");
      await client.executeMultiple(migration.replaceAll("--> statement-breakpoint",""));
    }
    const db = drizzle(client, { schema });
    repository = new UserRepository(db);
    const now = new Date();
    await db.insert(schema.user).values([
      { id: "alice", name: "Alice", email: "alice@example.test", emailVerified: false, createdAt: now, updatedAt: now },
      { id: "bob", name: "Bob", email: "bob@example.test", emailVerified: false, createdAt: now, updatedAt: now },
    ]);
  });

  afterEach(() => client.close());
  it('restores paged chat including cards across sessions, isolates users and clears only on request',async()=>{
    const session=await repository.createConversation('alice');
    for(let i=0;i<35;i++)await repository.addConversationMessage('alice',session,'assistant',`message ${i}`,[{type:'text',content:`message ${i}`}]);
    const bob=await repository.createConversation('bob');await repository.addConversationMessage('bob',bob,'user','private');
    const first=await repository.conversationHistory('alice');expect(first.messages).toHaveLength(30);expect(first.hasMore).toBe(true);expect(first.sessionId).toBe(session);
    expect(first.messages[0]!.blocks).toEqual([{type:'text',content:'message 5'}]);
    const older=await repository.conversationHistory('alice',first.before!);expect(older.messages).toHaveLength(5);expect(older.hasMore).toBe(false);
    expect(older.messages[0]!.content).toBe('message 0');
    await repository.clearConversations('alice');expect((await repository.conversationHistory('alice')).messages).toEqual([]);expect((await repository.conversationHistory('bob')).messages).toHaveLength(1);
  });
  it('Seen persists artwork and explicit neutral cancels a preference without manufacturing traits from Meh',async()=>{
    const item={...fixtureCatalog[0]!,posterUrl:'https://image.tmdb.org/t/p/w500/test.jpg'};
    await repository.markWatched('alice',item);expect((await repository.listHistory('alice'))[0]!.posterPath).toBe(item.posterUrl);
    await repository.applyFeedback('alice',item,'like');expect((await repository.getTaste('alice')).length).toBeGreaterThan(0);
    await repository.applyFeedback('alice',item,'meh');expect(await repository.getTaste('alice')).toEqual([]);
    await repository.upsertTaste('alice',[{dimension:'genre',key:'drama',score:0,confidence:1,evidenceCount:1,source:'explicit_edit'}]);
    expect((await repository.getTaste('alice'))[0]).toMatchObject({score:0,source:'explicit_edit'});
  });
  it('scoped taste survives corrections, deletion is isolated, and displayed batches are complete',async()=>{
    const signal={dimension:'combination',key:'Chinese romance',score:-1,confidence:1,evidenceCount:1,source:'chat_explicit',conditions:[{dimension:'genre' as const,values:['romance']},{dimension:'country' as const,values:['CN']}]};
    await repository.upsertTaste('alice',[signal]);
    await repository.upsertTaste('alice',[{...signal,conditions:undefined,score:1,source:'explicit_edit'}]);
    expect((await repository.getTaste('alice'))[0]?.conditions).toEqual(signal.conditions);
    await repository.removeTaste('bob','combination','chinese romance');
    expect(await repository.getTaste('alice')).toHaveLength(1);
    await repository.removeTaste('alice','combination','chinese romance');expect(await repository.getTaste('alice')).toHaveLength(0);
    const session=await repository.createConversation('alice');
    for(let n=0;n<2;n++){
      const message=await repository.addConversationMessage('alice',session,'assistant','cards');
      await repository.saveDisplayedItems('alice',session,message,Array.from({length:30},(_,i)=>({...fixtureCatalog[0]!,id:n*100+i})));
    }
    const refs=await repository.recentDisplayedItems('alice',session);
    expect(refs).toHaveLength(30);expect(refs[0]!.externalId).toBe('100');expect(refs.at(-1)!.position).toBe(30);
    await expect(repository.recentDisplayedItems('bob',session)).rejects.toThrow();
  });

  it("Chat forwards its guarded current filter to composition on a short follow-up",async()=>{
    const ai=new AiService("");const catalog=new FixtureTmdbRepository();
    const session=await repository.createConversation("alice");
    const previous=filterQuerySchema.parse({intent:"DISCOVERY",keywords:["memory","identity"],excludedKeywords:["superhero"],mediaType:"movie"});
    await repository.setSessionContext("alice",session,{filter:previous,country:"RO"});
    const parse=vi.spyOn(ai,"parseIntent").mockResolvedValue({...previous,maxRuntimeMinutes:110});
    const compose=vi.spyOn(ai,"compose").mockResolvedValue({intro:"No supported match.",quickActions:[],selectedKeys:[]});
    await new ChatService(repository,catalog,ai).respond("alice","Other options, under 110 minutes instead.",session);
    expect(parse).toHaveBeenCalledWith("Other options, under 110 minutes instead.",previous,expect.objectContaining({history:expect.any(Array)}));
    expect(compose.mock.calls[0]![3]).toEqual({...previous,maxRuntimeMinutes:110});
    parse.mockRestore();compose.mockRestore();
  });

  it("explicit Meh overrides weak watchlist inference without becoming a genre dislike",async()=>{
    const item=fixtureCatalog[0]!;
    await repository.addWatchlist("alice",item);
    await repository.learnFromTitle("alice",item,"watchlist");
    expect((await repository.getTaste("alice")).length).toBe(0);
    expect((await repository.getRecommendationState("alice")).wantHints.length).toBeGreaterThan(0);
    await repository.applyFeedback("alice",item,"meh");
    await repository.learnFromTitle("alice",item,"watchlist");
    expect(await repository.getTaste("alice")).toEqual([]);
    expect(await repository.listWatchlist("alice")).toHaveLength(1);
    expect(await repository.listHistory("alice")).toEqual([]);
    expect((await repository.getRecommendationState("alice")).wantHints).toEqual([]);
  });

  it("Want to see hints reverse immediately and explicit opinions/privacy override them",async()=>{
    const item=fixtureCatalog[0]!;
    await repository.addWatchlist("alice",item);await repository.markWatched("alice",item);
    expect((await repository.getRecommendationState("alice")).wantHints.length).toBeGreaterThan(0);
    expect((await repository.getRecommendationState("bob")).wantHints).toEqual([]);
    for(const reaction of ["like","super_like","dislike","meh"] as const){await repository.applyFeedback("alice",item,reaction);expect((await repository.getRecommendationState("alice")).wantHints).toEqual([]);}
    await repository.clearFeedback("alice",item.mediaType,item.id);
    expect((await repository.getRecommendationState("alice")).wantHints.length).toBeGreaterThan(0);
    await repository.updateSettings("alice",{behaviorPersonalization:false});expect((await repository.getRecommendationState("alice")).wantHints).toEqual([]);
    await repository.updateSettings("alice",{behaviorPersonalization:true});await repository.removeWatchlist("alice",item.mediaType,item.id);
    expect((await repository.getRecommendationState("alice")).wantHints).toEqual([]);expect((await repository.listHistory("alice")).length).toBe(1);
  });

  it("unrated seen hints are replaced by every opinion and restored only when opinion is cleared",async()=>{
    const item=fixtureCatalog[0]!;
    await repository.markWatched("alice",item);
    expect((await repository.getRecommendationState("alice")).seenHints.length).toBeGreaterThan(0);
    expect(await repository.getTaste("alice")).toEqual([]);
    for(const reaction of ["like","dislike","super_like","meh"] as const){
      await repository.applyFeedback("alice",item,reaction);
      expect((await repository.getRecommendationState("alice")).seenHints).toEqual([]);
    }
    await repository.clearFeedback("alice",item.mediaType,item.id);
    expect((await repository.getRecommendationState("alice")).seenHints.length).toBeGreaterThan(0);
    await repository.updateSettings("alice",{behaviorPersonalization:false});
    expect((await repository.getRecommendationState("alice")).seenHints).toEqual([]);
    await repository.updateSettings("alice",{behaviorPersonalization:true});
    await repository.removeWatched("alice",item.mediaType,item.id);
    expect((await repository.getRecommendationState("alice")).seenHints).toEqual([]);
  });

  it("failed taste updates roll back the opinion atomically",async()=>{
    const item=fixtureCatalog[0]!;
    await repository.applyFeedback("alice",item,"like");
    const before=await repository.getTaste("alice");
    const stub=vi.spyOn(UserRepository.prototype,"learnFromTitle").mockRejectedValueOnce(new Error("TEST_FAILURE"));
    try { await expect(repository.applyFeedback("alice",item,"dislike")).rejects.toThrow("TEST_FAILURE"); }
    finally {stub.mockRestore();}
    expect((await repository.listFeedback("alice"))[0]?.reaction).toBe("like");
    const stable=(rows:typeof before)=>rows.map(r=>({...r,updatedAt:undefined}));
    expect(stable(await repository.getTaste("alice"))).toEqual(stable(before));
  });

  it("keeps every seen/opinion combination independent and clears stale evidence",async()=>{
    const item=fixtureCatalog[0]!;
    await repository.markWatched("alice",item);
    expect(await repository.getTaste("alice")).toEqual([]);
    expect(await repository.listFeedback("alice")).toEqual([]);
    for(const reaction of ["like","dislike","super_like","meh"] as const){
      await repository.setFeedback("alice",item.mediaType,item.id,reaction);
      await repository.learnFromTitle("alice",item,reaction);
      expect(await repository.listHistory("alice")).toHaveLength(1);
      expect((await repository.listFeedback("alice"))[0]?.reaction).toBe(reaction);
    }
    expect(await repository.getTaste("alice")).toEqual([]);
    await repository.removeWatched("alice",item.mediaType,item.id);
    expect(await repository.listHistory("alice")).toEqual([]);
    expect(await repository.listFeedback("alice")).toHaveLength(1);
    expect((await repository.getRecommendationState("alice")).ratedKeys.has(`${item.mediaType}:${item.id}`)).toBe(true);
    await repository.clearFeedback("alice",item.mediaType,item.id);
    expect(await repository.listFeedback("alice")).toEqual([]);
  });

  it("scopes history and feedback undo and evidence to owner and media type",async()=>{
    const movie=fixtureCatalog[0]!,series={...movie,mediaType:"series" as const};
    for(const item of [movie,series]){
      await repository.markWatched("alice",item);
      await repository.setFeedback("alice",item.mediaType,item.id,"like");
      await repository.learnFromTitle("alice",item,"like");
    }
    await repository.clearFeedback("bob",movie.mediaType,movie.id);
    await repository.removeWatched("bob",movie.mediaType,movie.id);
    expect(await repository.listFeedback("bob")).toEqual([]);
    expect(await repository.listHistory("alice")).toHaveLength(2);
    await repository.clearFeedback("alice",movie.mediaType,movie.id);
    expect((await repository.listFeedback("alice"))[0]?.mediaType).toBe("series");
    expect((await repository.getTaste("alice"))[0]?.score).toBeGreaterThan(0);
    expect(await repository.listHistory("alice")).toHaveLength(2);
  });

  it("survives 160 reproducible mixed history/reaction transitions without conflation",async()=>{
    let seed=1937;
    const seen=new Set<string>(),rated=new Map<string,string>();
    for(let step=0;step<160;step++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const item={...fixtureCatalog[0]!,id:1+(seed%7),mediaType:seed%3===0?"series" as const:"movie" as const};
      const key=`${item.mediaType}:${item.id}`,operation=(seed>>>8)%7;
      if(operation===0){await repository.markWatched("alice",item);seen.add(key);}
      else if(operation===1){await repository.removeWatched("alice",item.mediaType,item.id);seen.delete(key);}
      else if(operation===2){await repository.clearFeedback("alice",item.mediaType,item.id);rated.delete(key);}
      else {
        const reaction=(["like","dislike","meh","super_like"] as const)[operation-3]!;
        await repository.setFeedback("alice",item.mediaType,item.id,reaction);
        await repository.learnFromTitle("alice",item,reaction);rated.set(key,reaction);
      }
      const history=await repository.listHistory("alice"),feedback=await repository.listFeedback("alice");
      expect(new Set(history.map(r=>`${r.mediaType}:${r.tmdbId}`))).toEqual(seen);
      expect(new Map(feedback.map(r=>[`${r.mediaType}:${r.tmdbId}`,r.reaction]))).toEqual(rated);
      expect(await repository.listHistory("bob")).toEqual([]);
      expect(await repository.listFeedback("bob")).toEqual([]);
    }
  });

  it("never returns another user's watchlist, taste, settings, or conversations", async () => {
    await repository.addWatchlist("alice", { id: 329865, mediaType: "movie", title: "Arrival", posterUrl: null });
    await repository.upsertTaste("alice", [{ dimension: "mood", key: "cerebral", score: 0.9, confidence: 0.8, evidenceCount: 2, source: "explicit" }]);
    const aliceConversation = await repository.createConversation("alice");

    expect(await repository.listWatchlist("bob")).toEqual([]);
    expect(await repository.getTaste("bob")).toEqual([]);
    expect(await repository.assertConversation("bob", aliceConversation)).toBe(false);
    await expect(repository.addConversationMessage("bob", aliceConversation, "user", "steal data")).rejects.toThrow("CONVERSATION_NOT_FOUND");
    expect((await repository.getSettings("bob")).profile.userId).toBe("bob");
  });

  it("scopes destructive deletes to the authenticated owner", async () => {
    await repository.addWatchlist("alice", { id: 1, mediaType: "movie", title: "A", posterUrl: null });
    await repository.removeWatchlist("bob", "movie", 1);
    expect(await repository.listWatchlist("alice")).toHaveLength(1);
  });
  it("deduplicates repeated reactions and lets an explicit correction override inference",async()=>{
    const item=fixtureCatalog[0]!;
    await repository.learnFromTitle("alice",item,"super_like");
    await repository.learnFromTitle("alice",item,"super_like");
    const signal=(await repository.getTaste("alice")).find((s)=>s.dimension==="genre")!;
    expect(signal.evidenceCount).toBe(1);
    await repository.upsertTaste("alice",[{...signal,score:-1,source:"explicit_edit"}]);
    await repository.learnFromTitle("alice",item,"like");
    expect((await repository.getTaste("alice")).find((s)=>s.dimension===signal.dimension&&s.key===signal.key)?.score).toBe(-1);
  });
  it("separates and expires session context without writing taste",async()=>{
    const id=await repository.createConversation("alice");
    await repository.setSessionContext("alice",id,{moods:["light"]});
    expect(await repository.getSessionContext("alice",id)).toEqual({moods:["light"]});
    expect(await repository.getTaste("alice")).toEqual([]);
    await expect(repository.getSessionContext("bob",id)).rejects.toThrow("CONVERSATION_NOT_FOUND");
    await repository.setSessionContext("alice",id,{moods:["dark"]},-1);
    expect(await repository.getSessionContext("alice",id)).toEqual({});
  });
  it("enforces an atomic AI quota under concurrent requests",async()=>{
    const attempts=await Promise.all(Array.from({length:8},()=>repository.incrementAiUsage("alice",3)));
    expect(attempts.filter(Boolean)).toHaveLength(3);
  });
  it("turning off behavior learning still permits explicit likes",async()=>{
    await repository.updateSettings("alice",{behaviorPersonalization:false});
    await repository.learnFromTitle("alice",fixtureCatalog[0]!,"watchlist");
    expect(await repository.getTaste("alice")).toEqual([]);
    await repository.learnFromTitle("alice",fixtureCatalog[0]!,"like");
    expect((await repository.getTaste("alice")).length).toBeGreaterThan(0);
  });
});
