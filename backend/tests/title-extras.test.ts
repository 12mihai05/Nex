import {expect,it,vi} from "vitest";
import {normalizeVideos} from "../src/domain/title-extras.js";
import {LiveTmdbRepository} from "../src/repositories/tmdb-repository.js";
import {createClient} from "@libsql/client";
import {drizzle} from "drizzle-orm/libsql";
import {readFile,readdir} from "node:fs/promises";
import * as schema from "../src/db/schema.js";

it("validates trailer links, excludes clips and duplicate keys, prefers official trailers",()=>{
  const v={key:"abcdefghijk",name:"Trailer",site:"YouTube",type:"Trailer",official:true};
  expect(normalizeVideos({results:[{...v,key:"xyzabcdefgh",official:false},v,v,{...v,key:"../../evil"},{...v,key:"zyxabcdefgh",type:"Clip"},{...v,site:"unknown"},{}]}).map(v=>v.id)).toEqual(["abcdefghijk","xyzabcdefgh"]);
});
it("caches/coalesces extras, loads only the requested season, and preserves missing episode metadata",async()=>{
  const client=createClient({url:":memory:"});
  try{
    for(const file of (await readdir(new URL("../drizzle/",import.meta.url))).filter(f=>f.endsWith(".sql")).sort())await client.executeMultiple((await readFile(new URL(`../drizzle/${file}`,import.meta.url),"utf8")).replaceAll("--> statement-breakpoint",""));
    const videos={results:[{key:"abcdefghijk",name:"Official",site:"YouTube",type:"Trailer",official:true}]};
    const fetcher=vi.fn(async(url:URL)=>new Response(JSON.stringify(url.pathname.includes("/season/")?{videos,episodes:[{episode_number:1,name:"Pilot",runtime:0,vote_average:0,vote_count:0},{episode_number:2,name:"Next",runtime:42,vote_average:8,vote_count:20}]}:{videos,seasons:[{season_number:0,name:"Specials",episode_count:1},{season_number:1,name:"Season 1",episode_count:2}]})));
    vi.stubGlobal("fetch",fetcher);
    const catalog=new LiveTmdbRepository("synthetic-token",drizzle(client,{schema}));
    const [a,b]=await Promise.all([catalog.extras("series",10),catalog.extras("series",10)]);
    expect(a).toEqual(b);expect(a.seasons).toHaveLength(2);expect(fetcher).toHaveBeenCalledTimes(1);
    const season=await catalog.season(10,1);
    expect(season.episodes[0]).toMatchObject({runtimeMinutes:null,rating:null});
    expect(season.episodes[1]).toMatchObject({runtimeMinutes:42,rating:8});
    await catalog.season(10,1);expect(fetcher).toHaveBeenCalledTimes(2);
  }finally{vi.unstubAllGlobals();client.close();}
});
