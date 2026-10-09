import {readFile,readdir} from "node:fs/promises";
import {createClient} from "@libsql/client";
import {drizzle} from "drizzle-orm/libsql";
import {it,expect,vi} from "vitest";
import * as schema from "../src/db/schema.js";
import {LiveTmdbRepository} from "../src/repositories/tmdb-repository.js";
it('a cache database outage cannot discard successfully fetched public metadata',async()=>{
 const client=createClient({url:':memory:'});
 try{
  // Deliberately no cache table: every persistence operation fails.
  const db=drizzle(client,{schema});
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({results:[]}),{status:200}));
  vi.stubGlobal('fetch',fetcher);
  const catalog=new LiveTmdbRepository('synthetic-test-token',db);
  await expect(catalog.discover({region:'RO',mediaType:'movie'})).resolves.toEqual([]);
  await expect(catalog.discover({region:'RO',mediaType:'movie'})).resolves.toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(1);
 }finally{vi.unstubAllGlobals();client.close();}
});
it("coalesces public lookups, keys by country and refreshes expired entries",async()=>{
  const client=createClient({url:":memory:"});
  try{
    for(const file of (await readdir(new URL("../drizzle/",import.meta.url))).filter(f=>f.endsWith(".sql")).sort())await client.executeMultiple((await readFile(new URL(`../drizzle/${file}`,import.meta.url),"utf8")).replaceAll("--> statement-breakpoint",""));
    const queries:string[]=[];
    const db=drizzle(client,{schema,logger:{logQuery(query){queries.push(query);}}});
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({results:[]}),{status:200,headers:{"content-type":"application/json"}}));vi.stubGlobal("fetch",fetcher);
    const catalog=new LiveTmdbRepository("synthetic-test-token",db);
    const request={region:"RO",mediaType:"movie" as const};
    await Promise.all([catalog.discover(request),catalog.discover(request)]);expect(fetcher).toHaveBeenCalledTimes(1);
    await catalog.discover(request);expect(fetcher).toHaveBeenCalledTimes(1);
    await catalog.discover({...request,region:"GB"});expect(fetcher).toHaveBeenCalledTimes(2);
    await db.update(schema.tmdbCache).set({expiresAt:new Date(0)});
    // A warm worker may retain public metadata for at most one minute.
    const now=Date.now();vi.spyOn(Date,'now').mockReturnValue(now+61_000);
    await catalog.discover(request);expect(fetcher).toHaveBeenCalledTimes(3);
    fetcher.mockImplementationOnce(async()=>new Response("",{status:503}));
    await expect(catalog.discover({...request,region:"FR"})).rejects.toThrow();
    await catalog.discover({...request,region:"FR"});expect(fetcher).toHaveBeenCalledTimes(5);
    fetcher.mockImplementation(async()=>new Response(JSON.stringify({id:42,title:"Shared metadata",genres:[],keywords:{keywords:[]},"watch/providers":{results:{RO:{flatrate:[{provider_id:8,provider_name:"Netflix"}]}}}}),{status:200,headers:{"content-type":"application/json"}}));
    const [owner,nonOwner]=await Promise.all([catalog.getTitle("movie",42,"RO",[8]),catalog.getTitle("movie",42,"RO",[])]);
    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(owner!.availability[0]!.owned).toBe(true);
    expect(nonOwner!.availability[0]!.owned).toBe(false);
    expect((await catalog.getTitle("movie",42,"RO",[]))!.availability[0]!.owned).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(6);
    // A fresh worker warms metadata AND country-specific availability in bulk.
    fetcher.mockImplementation(async()=>new Response(JSON.stringify({results:[{id:42,title:'Shared metadata'}]}),{status:200,headers:{'content-type':'application/json'}}));
    const fresh=new LiveTmdbRepository('synthetic-test-token',db);
    queries.length=0;
    const batch=await fresh.discover({...request,page:2});
    expect(batch[0]?.title).toBe('Shared metadata');
    expect(batch[0]?.availability[0]?.providerId).toBe(8);
    expect(batch[0]?.availability[0]?.owned).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(7);
    expect(queries.filter(q=>q.startsWith('select')&&q.includes('tmdb_cache'))).toHaveLength(2);
  }finally{vi.restoreAllMocks();vi.unstubAllGlobals();client.close();}
});
