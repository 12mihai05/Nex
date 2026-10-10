import {afterEach,expect,it,vi} from "vitest";
import type { OpenAI } from "openai";
import {AiService} from "../src/services/ai.js";
import {filterQuerySchema} from "../src/domain/types.js";
import {fixtureCatalog} from "../src/fixtures/catalog.js";

afterEach(()=>vi.restoreAllMocks());
it("sends resolved follow-up constraints to the stateless editor without adding conversation history",async()=>{
  const ai=new AiService("test-key");
  const client=(ai as unknown as {client:OpenAI}).client;
  const parse=vi.spyOn(client.responses,"parse").mockResolvedValue({output_parsed:{intro:"A grounded choice.",quickActions:[],selections:[]}} as never);
  const filters=filterQuerySchema.parse({intent:"DISCOVERY",keywords:["memory","identity"],keywordMatch:"any",excludedKeywords:["superhero"],maxRuntimeMinutes:110,mediaType:"movie",availabilityScope:"owned_services"});
  await ai.compose("Other options, under 110 minutes instead.",[{item:fixtureCatalog[0]!,reason:"Supported catalog evidence"}],true,filters);
  expect(parse).toHaveBeenCalledTimes(1);
  const request=parse.mock.calls[0]![0]!;
  expect(request.store).toBe(false);
  const messages=request.input as Array<{role:string;content:string}>;
  const payload=JSON.parse(messages.find(m=>m.role==="user")!.content);
  expect(payload.resolvedFilters).toEqual(filters);
  expect(payload.message).toBe("Other options, under 110 minutes instead.");
  expect(Object.keys(payload).sort()).toEqual(["candidates","context","message","resolvedFilters","reviewConcepts"]);
  expect(payload.context).toBeNull();
});

it("passes the current replacement constraints, not a stale prior topic, and preserves honest abstention",async()=>{
  const ai=new AiService("test-key");
  const parse=vi.spyOn((ai as unknown as {client:OpenAI}).client.responses,"parse").mockResolvedValue({output_parsed:{intro:"No supported match.",quickActions:[],selections:[]}} as never);
  const current=filterQuerySchema.parse({intent:"DISCOVERY",genres:["mystery"],moods:["tense"],keywords:[],maxRuntimeMinutes:99});
  const result=await ai.compose("A tense mystery instead, keep the time limit.",[],true,current);
  const messages=parse.mock.calls[0]![0]!.input as Array<{role:string;content:string}>;
  expect(JSON.parse(messages.find(m=>m.role==="user")!.content).resolvedFilters).toEqual(current);
  expect(result.selectedKeys).toEqual([]);
});

it('allows grounded contextual ordering only for similar-title requests',async()=>{
  const ai=new AiService('test-key');const items=fixtureCatalog.slice(0,2);
  const keys=items.map(i=>`${i.mediaType}:${i.id}`);
  vi.spyOn((ai as unknown as {client:OpenAI}).client.responses,'parse').mockResolvedValue({output_parsed:{intro:'A supported connection.',quickActions:[],selections:[{key:keys[1],evidence:items[1]!.overview.slice(0,40)},{key:keys[0],evidence:items[0]!.overview.slice(0,40)}]}} as never);
  const candidates=items.map(item=>({item,reason:'Catalog evidence'}));
  const similar=await ai.compose('Like that film',candidates,true,filterQuerySchema.parse({intent:'DISCOVERY',similarTo:'A reference film'}));
  expect(similar.selectedKeys).toEqual([keys[1],keys[0]]);
  const normal=await ai.compose('A theme',candidates,true,filterQuerySchema.parse({intent:'DISCOVERY',keywords:['friendship']}));
  expect(normal.selectedKeys).toEqual(keys);
});
