import { z } from "zod";

export const mediaTypeSchema = z.enum(["movie", "series"]);
export type MediaType = z.infer<typeof mediaTypeSchema>;

export const availabilitySchema = z.object({
  providerId: z.number().int(),
  providerName: z.string(),
  logoUrl: z.string().nullable(),
  access: z.enum(["included", "rent", "buy", "subscription_required"]),
  owned: z.boolean(),
});

export const contentItemSchema = z.object({
  id: z.number().int(),
  mediaType: mediaTypeSchema,
  title: z.string(),
  originalTitle: z.string().nullable(),
  overview: z.string(),
  year: z.number().int().nullable(),
  runtimeMinutes: z.number().int().positive().nullable(),
  rating: z.number().min(0).max(10).nullable(),
  voteCount: z.number().int().nonnegative().optional(),
  countries: z.array(z.string()).optional(),
  collection: z.string().nullable().optional(),
  popularity: z.number().nonnegative(),
  posterUrl: z.string().nullable(),
  backdropUrl: z.string().nullable(),
  genres: z.array(z.string()),
  genreIds: z.array(z.number().int()),
  moods: z.array(z.string()),
  keywords: z.array(z.string()),
  cast: z.array(z.string()),
  director: z.string().nullable(),
  originalLanguage: z.string().nullable(),
  availability: z.array(availabilitySchema),
});
export type ContentItem = z.infer<typeof contentItemSchema>;

export const filterQuerySchema = z.object({
  intent: z.enum(["TITLE_LOOKUP", "DISCOVERY", "PERSON_LOOKUP", "AVAILABILITY_LOOKUP"]),
  query: z.string().default(""),
  mediaType: z.enum(["movie", "series", "any"]).default("any"),
  availabilityScope: z.enum(["owned_services", "all_providers"]).default("owned_services"),
  providerIds: z.array(z.number().int()).default([]),
  maxRuntimeMinutes: z.number().int().positive().nullable().default(null),
  minRuntimeMinutes: z.number().int().positive().nullable().default(null),
  genres: z.array(z.string()).default([]),
  genreMatch: z.enum(["any","all"]).default("any").describe("all for a requested genre combination (horror comedy); any for alternatives (horror OR comedy)."),
  moods: z.array(z.string()).default([]),
  excludedMoods: z.array(z.string()).default([]),
  keywords: z.array(z.string().max(80)).max(8).default([]).describe("Requested story concepts/themes, not inferred genres. E.g. underdog, time loop, friendship."),
  keywordMatch:z.enum(["any","all"]).default("any").describe("all only when the user requires concepts combined in the same film; any for alternatives."),
  excludedKeywords: z.array(z.string().max(80)).max(8).default([]),
  originalLanguages: z.array(z.string().regex(/^[a-z]{2}$/)).max(5).default([]).describe("Only explicit original-language constraints; not subtitle availability."),
  excludeWatched: z.boolean().default(true),
  tvWindow: z.enum(["live", "tonight", "tomorrow"]).nullable().default(null),
  similarTo: z.string().max(160).nullable().default(null),
});
export type FilterQuery = z.infer<typeof filterQuerySchema>;

export const tasteSignalSchema = z.object({
  dimension: z.string(),
  key: z.string(),
  score: z.number().min(-1).max(1),
  confidence: z.number().min(0).max(1),
  evidenceCount: z.number().int().positive(),
  source: z.string(),
  explicit: z.boolean().optional(),
  lastEvidenceAt: z.string().optional(),
  updatedAt: z.string().optional(),
  sources: z.array(z.string()).optional(),
});
export type TasteSignal = z.infer<typeof tasteSignalSchema>;

export const chatBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), content: z.string() }),
  z.object({ type: z.literal("movie_carousel"), items: z.array(contentItemSchema).max(12) }),
  z.object({ type: z.literal("tv_carousel"), items: z.array(z.record(z.string(), z.unknown())).max(12) }),
  z.object({ type: z.literal("availability_block"), item: contentItemSchema }),
  z.object({ type: z.literal("quick_actions"), actions: z.array(z.string()).max(6) }),
  z.object({ type: z.literal("confirmation"), content: z.string(), action: z.discriminatedUnion("type",[
    z.object({ type: z.literal("setReminder"), id: z.string(), epgProgramId:z.string(), title: z.string(), channelName:z.string().nullable().optional(), startsAt: z.string(), offsetMinutes: z.number().int() }),
    z.object({ type:z.literal("cancelReminder"), id:z.string(), epgProgramId:z.string() }),
  ]).optional() }),
  z.object({ type: z.literal("empty_state"), title: z.string(), message: z.string() }),
]);
export type ChatBlock = z.infer<typeof chatBlockSchema>;

export interface RecommendationEvidence {
  code: string;
  label: string;
  weight: number;
}

export interface RankedContent {
  item: ContentItem;
  score: number;
  reason: string;
  evidence: RecommendationEvidence[];
}
