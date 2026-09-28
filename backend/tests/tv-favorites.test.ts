import {readFile,readdir} from "node:fs/promises";
import {createClient} from "@libsql/client";
import {drizzle} from "drizzle-orm/libsql";
import {beforeEach,afterEach,it,expect} from "vitest";
import * as schema from "../src/db/schema.js";
import {EpgService} from "../src/services/epg/service.js";
import {FixtureTmdbRepository} from "../src/repositories/tmdb-repository.js";
import {rankTv,tvPreview} from "../src/services/epg/tv-ranking.js";
import {fixtureCatalog} from "../src/fixtures/catalog.js";
let client:ReturnType<typeof createClient>;let epg:EpgService;
const now=new Date("2030-01-01T12:00:00Z");
beforeEach(async()=>{
  client=createClient({url:":memory:"});
  for(const file of (await readdir(new URL("../drizzle/",import.meta.url))).filter(f=>f.endsWith(".sql")).sort())await client.executeMultiple((await readFile(new URL(`../drizzle/${file}`,import.meta.url),"utf8")).replaceAll("--> statement-breakpoint",""));
  const db=drizzle(client,{schema});
  await db.insert(schema.user).values([{id:"alice",name:"A",email:"a@test.local"},{id:"bob",name:"B",email:"b@test.local"}]);
  await db.insert(schema.channels).values(Array.from({length:23},(_,i)=>({id:`c${i}`,sourceId:"fixture",externalId:`c${i}`,displayName:i===0?"Zulu":"Alpha",country:i===22?"GB":"RO"})));
  await db.insert(schema.epgPrograms).values([
    {id:"earlier",channelId:"c1",startAt:new Date(+now+5*60000)},
    {id:"favorite",channelId:"c0",startAt:new Date(+now+20*60000)},
    {id:"later",channelId:"c0",startAt:new Date(+now+90*60000)},
    {id:"tie-b",channelId:"c2",startAt:new Date(+now+5*60000)},
    {id:"tie-a",channelId:"c2",startAt:new Date(+now+5*60000)},
    {id:"foreign",channelId:"c22",startAt:new Date(+now+2*60000)},
  ].map(p=>({...p,title:p.id,sourceId:"fixture",sourceProgramId:p.id,endAt:new Date(+p.startAt+3600000)})));
  epg=new EpgService(db,{sourceId:"fixture",load:async()=>({channels:[],programs:[],sourceTimestamp:null})},new FixtureTmdbRepository());
});
afterEach(()=>client.close());
it("title broadcasts include non-favorites, translated titles and live shows, but not remakes, expired or foreign entries",async()=>{
  const db=drizzle(client,{schema});
  const item={...fixtureCatalog[0]!,id:336843,mediaType:"movie" as const,title:"Maze Runner: The Death Cure",originalTitle:"Maze Runner: The Death Cure",year:2018};
  const catalog=new FixtureTmdbRepository() as FixtureTmdbRepository & {titleAliases:()=>Promise<string[]>};
  catalog.titleAliases=async()=>["Labirintul: Tratament letal"];
  const service=new EpgService(db,undefined,catalog);
  await db.insert(schema.epgPrograms).values([
    {id:"live-match",channelId:"c1",year:2018,startAt:new Date(+now-60000),endAt:new Date(+now+60000)},
    {id:"upcoming-match",channelId:"c0",year:2018,startAt:new Date(+now+86400000),endAt:new Date(+now+90000000)},
    {id:"wrong-year",channelId:"c1",year:2020,startAt:now,endAt:new Date(+now+60000)},
    {id:"wrong-country",channelId:"c22",year:2018,startAt:now,endAt:new Date(+now+60000)},
    {id:"expired-match",channelId:"c1",year:2018,startAt:new Date(+now-120000),endAt:new Date(+now-1)},
  ].map(p=>({...p,title:"Labirintul: Tratament letal",category:"Film",sourceId:"fixture",sourceProgramId:p.id})));
  const rows=await service.broadcastsForTitle(item,"RO",now);
  expect(rows.map(p=>p.id)).toEqual(["live-match","upcoming-match"]);
  expect(await service.broadcastsForTitle({...item,id:111,title:"Other sequel",originalTitle:"Other sequel",year:2015},"RO",now)).toEqual([]);
});
it("pages through a busy favorites-only window without hiding other viewers' channels",async()=>{
  await epg.setChannelFavorite("alice","RO","c0",true);
  const db=drizzle(client,{schema});
  await db.insert(schema.epgPrograms).values(Array.from({length:130},(_,i)=>({id:`page-${i}`,channelId:"c0",startAt:new Date(+now+30*60000+i*1000),endAt:new Date(+now+2*3600000),title:`Show ${i}`,sourceId:"fixture",sourceProgramId:`page-${i}`})));
  const first=await epg.listWindow(now,new Date(+now+12*3600000),"RO","alice",{favoritesOnly:true});
  const next=await epg.listWindow(now,new Date(+now+12*3600000),"RO","alice",{favoritesOnly:true,offset:100});
  expect(first).toHaveLength(100);expect(next).toHaveLength(32);
  expect(new Set([...first,...next].map(p=>p.id)).size).toBe(132);
  expect([...first,...next].every(p=>p.favorite&&p.channel.id==="c0")).toBe(true);
  expect(await epg.listWindow(now,new Date(+now+12*3600000),"RO","bob",{favoritesOnly:true})).toEqual([]);
});
it("orders by time bucket, favorite, start, channel and stable programme ID; isolates viewers and countries",async()=>{
  await epg.setChannelFavorite("alice","RO","c0",true);
  expect((await epg.listWindow(now,new Date(+now+12*3600000),"RO","alice")).map(p=>p.id)).toEqual(["favorite","earlier","tie-a","tie-b","later"]);
  const bob=await epg.listWindow(now,new Date(+now+12*3600000),"RO","bob");expect(bob[0]!.id).toBe("earlier");expect(bob.every(p=>!p.favorite)).toBe(true);
  await expect(epg.setChannelFavorite("alice","RO","c22",true)).rejects.toThrow("CHANNEL_NOT_FOUND");
  await epg.setChannelFavorite("bob","RO","c0",false);expect((await epg.listChannels("alice","RO","",0,true))).toHaveLength(1);
  await epg.setChannelFavorite("alice","RO","c0",false);expect((await epg.listChannels("alice","RO","",0,true))).toHaveLength(0);
});
it("keeps channels without schedules searchable and enforces a bounded favorite count",async()=>{
  expect((await epg.listChannels("alice","RO")).length).toBe(22);
  expect((await epg.listChannels("alice","RO")).find(c=>c.id==="c20")!.available).toBe(false);
  const db=drizzle(client,{schema});
  await db.insert(schema.channels).values(Array.from({length:29},(_,i)=>({id:`extra${i}`,sourceId:"fixture",externalId:`extra${i}`,displayName:`Extra ${i}`,country:"RO"})));
  for(let i=0;i<22;i++)await epg.setChannelFavorite("alice","RO",`c${i}`,true);
  for(let i=0;i<28;i++)await epg.setChannelFavorite("alice","RO",`extra${i}`,true);
  await epg.setChannelFavorite("alice","RO","c0",true);
  await expect(epg.setChannelFavorite("alice","RO","extra28",true)).rejects.toThrow("CHANNEL_FAVORITE_LIMIT");
});
it("preview reserves exposure to non-favorites, never drops them from the full result",()=>{
  const items=Array.from({length:12},(_,i)=>({id:String(i),startAt:new Date(+now+60000*i),endAt:new Date(+now+3600000),favorite:i<8,channel:{name:"A"}}));
  const ranked=rankTv(items,now);const preview=tvPreview(ranked);
  expect(preview).toHaveLength(6);expect(preview.filter(i=>!i.favorite)).toHaveLength(2);expect(ranked).toHaveLength(12);
});
it("withdrawn channels are hidden but existing favorites can still be removed",async()=>{
  await epg.setChannelFavorite("alice","RO","c0",true);
  await client.execute("update channels set active=0 where id='c0'");
  expect((await epg.listChannels("bob","RO")).some(c=>c.id==="c0")).toBe(false);
  const own=(await epg.listChannels("alice","RO","",0,true))[0]!;
  expect(own.active).toBe(false);expect(own.available).toBe(false);
  expect((await epg.listWindow(now,new Date(+now+12*3600000),"RO","alice")).some(p=>p.channel.id==="c0")).toBe(false);
  await expect(epg.setChannelFavorite("bob","RO","c0",true)).rejects.toThrow("CHANNEL_NOT_FOUND");
  await epg.setChannelFavorite("alice","RO","c0",false);
  expect(await epg.listChannels("alice","RO","",0,true)).toEqual([]);
});
it("sync passes requested favorites to the provider independently of movie taste",async()=>{
  const db=drizzle(client,{schema});
  await db.insert(schema.channels).values({id:"fixture:outside",sourceId:"fixture",externalId:"outside",displayName:"Requested channel",country:"RO"});
  await epg.setChannelFavorite("alice","RO","fixture:outside",true);let received=new Set<string>();
  const service=new EpgService(db,{sourceId:"fixture",load:async options=>{received=options!.preferredExternalIds;return {channels:[{externalId:"outside",displayName:"Requested channel",logoUrl:null,language:null}],programs:[{sourceProgramId:"new",channelExternalId:"outside",title:"Programme",startAt:now,endAt:new Date(+now+3600000),subtitle:null,description:null,category:null,language:null,year:null}],sourceTimestamp:null};}},new FixtureTmdbRepository());
  await service.sync(now);expect(received.has("outside")).toBe(true);
  expect(await db.select().from(schema.userTastePreferences)).toEqual([]);
});
