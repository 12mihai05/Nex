import { z } from "zod";

const video = z.object({ key:z.string(), name:z.string(), site:z.string(), type:z.string(), official:z.boolean().optional(), iso_639_1:z.string().optional() });
export function normalizeVideos(value: unknown) {
  const rows=z.object({results:z.array(z.unknown()).default([])}).parse(value??{}).results;
  const seen=new Set<string>();
  return rows.flatMap(raw=>{
    const result=video.safeParse(raw);if(!result.success)return [];
    const v=result.data;
    if(!["Trailer","Teaser"].includes(v.type)||v.site!=="YouTube"||! /^[\w-]{11}$/.test(v.key)||seen.has(v.key))return [];
    seen.add(v.key);
    return [{id:v.key,name:v.name,type:v.type,official:v.official??false,language:v.iso_639_1??null,url:`https://www.youtube.com/watch?v=${v.key}`}];
  }).sort((a,b)=>Number(b.official)-Number(a.official)||Number(b.type==="Trailer")-Number(a.type==="Trailer"));
}
export const seasonSummarySchema=z.object({season_number:z.number().int().nonnegative(),name:z.string(),episode_count:z.number().int().nonnegative().default(0)});
export const episodeSchema=z.object({episode_number:z.number().int().positive(),name:z.string(),runtime:z.number().nonnegative().nullable().optional(),vote_average:z.number().min(0).max(10).optional(),vote_count:z.number().nonnegative().optional(),air_date:z.string().nullable().optional()});
export type TitleExtras={videos:ReturnType<typeof normalizeVideos>;seasons:Array<{number:number;name:string;episodeCount:number}>};
export type SeasonExtras={videos:ReturnType<typeof normalizeVideos>;episodes:Array<{number:number;name:string;runtimeMinutes:number|null;rating:number|null;airDate:string|null}>};
