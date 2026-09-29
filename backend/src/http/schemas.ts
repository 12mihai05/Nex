import { z } from "zod";
import { filterQuerySchema, mediaTypeSchema, tasteSignalSchema } from "../domain/types.js";

export const paginationSchema = z.object({ page: z.coerce.number().int().min(1).max(100).default(1) });
export const searchQuerySchema = paginationSchema.extend({ q: z.string().trim().min(1).max(160) });
export const titleParamsSchema = z.object({ mediaType: mediaTypeSchema, tmdbId: z.coerce.number().int().positive() });
export const recommendBodySchema = z.object({ viewerIds: z.array(z.string()).max(5).optional(), filter: filterQuerySchema.partial().default({}) });
export const surpriseBodySchema = z.object({ mediaType:z.enum(["any","movie","series"]).default("any"), genres:z.array(z.string().max(80)).max(1).default([]), minRuntimeMinutes:z.number().int().positive().max(1440).nullable().default(null), maxRuntimeMinutes: z.number().int().positive().max(1440).nullable().default(null), mood: z.string().max(40).nullable().default(null), excludedIds: z.array(z.number().int()).max(50).default([]), providerIds:z.array(z.number().int().positive()).min(1).max(100).optional(), watchStatus:z.enum(["new","again","either"]).default("new") }).refine(q=>!q.minRuntimeMinutes||!q.maxRuntimeMinutes||q.minRuntimeMinutes<=q.maxRuntimeMinutes,{message:"Invalid duration range"});
export const onboardingBodySchema = z.object({ description: z.string().max(3000), favorites: z.array(z.object({ id: z.number().int(), mediaType: mediaTypeSchema, title: z.string(), genres: z.array(z.string()).optional() })).max(5), genres: z.array(z.string().max(80)).max(20).default([]), moods: z.array(z.string().max(80)).max(20).default([]), concepts:z.array(z.string().max(80)).max(40).default([]) });
export const chatBodySchema = z.object({ sessionId: z.string().uuid().optional(), message: z.string().trim().min(1).max(16000) });
export const settingsBodySchema = z.object({
  country: z.string().regex(/^[a-z]{2}$/i).transform((value) => value.toUpperCase()).refine(value=>Boolean(new Intl.DisplayNames(["en"],{type:"region",fallback:"none"}).of(value)),"Unknown country").optional(),
  timezone: z.string().max(80).refine(value=>{try {new Intl.DateTimeFormat("en",{timeZone:value});return true;}catch{return false;}},"Unknown timezone").optional(),
  appearance: z.enum(["system", "light", "dark"]).optional(), behaviorPersonalization: z.boolean().optional(), remindersEnabled: z.boolean().optional(), onboardingComplete: z.boolean().optional(),
  services: z.array(z.object({ providerId: z.number().int(), providerName: z.string(), logoPath: z.string().nullable().optional() })).max(30).optional(),
  audioLanguages: z.array(z.string().max(12)).max(12).optional(), subtitleLanguages: z.array(z.string().max(12)).max(12).optional(), preferOriginal: z.boolean().optional(),
});
export const tasteBodySchema = z.object({ signals: z.array(tasteSignalSchema).max(100) });
export const titleActionSchema = z.object({ tmdbId: z.number().int().positive(), mediaType: mediaTypeSchema, title: z.string().min(1).max(300), posterUrl: z.string().url().nullable().optional() });
export const feedbackBodySchema = z.object({ tmdbId: z.number().int().positive(), mediaType: mediaTypeSchema, reaction: z.enum(["super_like", "like", "meh", "dislike"]) });
export const reminderBodySchema = z.object({ epgProgramId: z.string().min(1).max(200), offsetMinutes: z.number().int().min(0).max(1440) });
