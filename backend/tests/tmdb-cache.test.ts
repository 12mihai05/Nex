import {readFile,readdir} from "node:fs/promises";
import {createClient} from "@libsql/client";
import {drizzle} from "drizzle-orm/libsql";
import {it,expect,vi} from "vitest";
import * as schema from "../src/db/schema.js";
import {LiveTmdbRepository} from "../src/repositories/tmdb-repository.js";
it("coalesces public lookups, keys by country and refreshes expired entries",async()=>{
  const client=createClient({url:":memory:"});
  try{
    for(const file of (await readdir(new URL("../drizzle/",import.meta.url))).filter(f=>f.endsWith(".sql")).sort())await client.executeMultiple((await readFile(new URL(`../drizzle/${file}`,import.meta.url),"utf8")).replaceAll("--> statement-breakpoint",""));
    const db=drizzle(client,{schema});
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({results:[]}),{status:200,headers:{"content-type":"application/json"}}));vi.stubGlobal("fetch",fetcher);
    const catalog=new LiveTmdbRepository("synthetic-test-token",db);
    const request={region:"RO",mediaType:"movie" as const};
    await Promise.all([catalog.discover(request),catalog.discover(request)]);expect(fetcher).toHaveBeenCalledTimes(1);
    await catalog.discover(request);expect(fetcher).toHaveBeenCalledTimes(1);
    await catalog.discover({...request,region:"GB"});expect(fetcher).toHaveBeenCalledTimes(2);
    await db.update(schema.tmdbCache).set({expiresAt:new Date(0)});
    await catalog.discover(request);expect(fetcher).toHaveBeenCalledTimes(3);
    fetcher.mockImplementationOnce(async()=>new Response("",{status:503}));
    await expect(catalog.discover({...request,region:"FR"})).rejects.toThrow();
    await catalog.discover({...request,region:"FR"});expect(fetcher).toHaveBeenCalledTimes(5);
  }finally{vi.unstubAllGlobals();client.close();}
});
