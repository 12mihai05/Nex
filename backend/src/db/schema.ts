import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);
const updatedAt = () => integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (table) => [index("session_user_idx").on(table.userId), index("session_token_idx").on(table.token)]);

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("account_user_idx").on(table.userId), uniqueIndex("account_provider_unique").on(table.providerId, table.accountId)]);

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("verification_identifier_idx").on(table.identifier)]);

export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  country: text("country").notNull().default("RO"),
  timezone: text("timezone").notNull().default("Europe/Bucharest"),
  onboardingComplete: integer("onboarding_complete", { mode: "boolean" }).notNull().default(false),
  appearance: text("appearance", { enum: ["system", "light", "dark"] }).notNull().default("system"),
  behaviorPersonalization: integer("behavior_personalization", { mode: "boolean" }).notNull().default(true),
  remindersEnabled: integer("reminders_enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const userStreamingServices = sqliteTable("user_streaming_services", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  providerId: integer("provider_id").notNull(),
  providerName: text("provider_name").notNull(),
  logoPath: text("logo_path"),
  createdAt: createdAt(),
}, (table) => [primaryKey({ columns: [table.userId, table.providerId] }), index("streaming_user_idx").on(table.userId)]);

export const userLanguagePreferences = sqliteTable("user_language_preferences", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["audio", "subtitle"] }).notNull(),
  languageCode: text("language_code").notNull(),
  preferOriginal: integer("prefer_original", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
}, (table) => [primaryKey({ columns: [table.userId, table.kind, table.languageCode] })]);

export const userTastePreferences = sqliteTable("user_taste_preferences", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  dimension: text("dimension").notNull(),
  key: text("key").notNull(),
  score: real("score").notNull(),
  confidence: real("confidence").notNull(),
  evidenceCount: integer("evidence_count").notNull().default(1),
  source: text("source").notNull(),
  evidenceJson: text("evidence_json").notNull().default("[]"),
  explicit: integer("explicit", { mode: "boolean" }).notNull().default(false),
  lastEvidenceAt: integer("last_evidence_at", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("taste_user_dimension_key_unique").on(table.userId, table.dimension, table.key), index("taste_user_idx").on(table.userId)]);

export const userTitleFeedback = sqliteTable("user_title_feedback", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  mediaType: text("media_type", { enum: ["movie", "series"] }).notNull(),
  tmdbId: integer("tmdb_id").notNull(),
  reaction: text("reaction", { enum: ["super_like", "like", "meh", "dislike"] }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [primaryKey({ columns: [table.userId, table.mediaType, table.tmdbId] }), index("feedback_user_idx").on(table.userId)]);

export const watchlist = sqliteTable("watchlist", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  mediaType: text("media_type", { enum: ["movie", "series"] }).notNull(),
  tmdbId: integer("tmdb_id").notNull(),
  titleSnapshot: text("title_snapshot").notNull(),
  posterPath: text("poster_path"),
  traitsJson: text("traits_json").notNull().default("[]"),
  createdAt: createdAt(),
}, (table) => [primaryKey({ columns: [table.userId, table.mediaType, table.tmdbId] }), index("watchlist_user_created_idx").on(table.userId, table.createdAt)]);

export const watchHistory = sqliteTable("watch_history", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  mediaType: text("media_type", { enum: ["movie", "series", "episode"] }).notNull(),
  tmdbId: integer("tmdb_id").notNull(),
  watchedAt: integer("watched_at", { mode: "timestamp_ms" }).notNull(),
  titleSnapshot: text("title_snapshot").notNull(),
  traitsJson: text("traits_json").notNull().default("[]"),
  createdAt: createdAt(),
}, (table) => [index("history_user_watched_idx").on(table.userId, table.watchedAt), uniqueIndex("history_user_title_unique").on(table.userId, table.mediaType, table.tmdbId)]);

export const channels = sqliteTable("channels", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  externalId: text("external_id").notNull(),
  displayName: text("display_name").notNull(),
  logoUrl: text("logo_url"),
  language: text("language"),
  country: text("country").notNull().default("RO"),
  canonicalId: text("canonical_id"),
  active: integer("active",{mode:"boolean"}).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("channel_source_external_unique").on(table.sourceId, table.externalId), index("channel_country_idx").on(table.country)]);

export const channelFavorites = sqliteTable("channel_favorites", {
  userId: text("user_id").notNull().references(() => user.id, {onDelete:"cascade"}),
  channelId: text("channel_id").notNull().references(() => channels.id, {onDelete:"cascade"}),
  createdAt: createdAt(),
}, table=>[primaryKey({columns:[table.userId,table.channelId]}),index("favorite_channel_idx").on(table.channelId)]);

export const epgPrograms = sqliteTable("epg_programs", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  sourceProgramId: text("source_program_id").notNull(),
  channelId: text("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  description: text("description"),
  startAt: integer("start_at", { mode: "timestamp_ms" }).notNull(),
  endAt: integer("end_at", { mode: "timestamp_ms" }).notNull(),
  category: text("category"),
  language: text("language"),
  year: integer("year"),
  matchedTmdbId: integer("matched_tmdb_id"),
  matchedMediaType: text("matched_media_type", { enum: ["movie", "series"] }),
  matchConfidence: real("match_confidence"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("epg_source_program_unique").on(table.sourceId, table.sourceProgramId), index("epg_channel_time_idx").on(table.channelId, table.startAt), index("epg_time_idx").on(table.startAt, table.endAt)]);

export const epgTmdbMatches = sqliteTable("epg_tmdb_matches", {
  normalizedTitle: text("normalized_title").notNull(),
  mediaType: text("media_type", { enum: ["movie", "series"] }).notNull(),
  tmdbId: integer("tmdb_id").notNull(),
  confidence: real("confidence").notNull(),
  evidenceJson: text("evidence_json").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [primaryKey({ columns: [table.normalizedTitle, table.mediaType] }), index("epg_match_tmdb_idx").on(table.tmdbId)]);

export const epgSyncRuns = sqliteTable("epg_sync_runs", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  status: text("status", { enum: ["running", "success", "failed"] }).notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  sourceTimestamp: integer("source_timestamp", { mode: "timestamp_ms" }),
  importedRows: integer("imported_rows").notNull().default(0),
  deletedRows: integer("deleted_rows").notNull().default(0),
  errorCode: text("error_code"),
}, (table) => [index("epg_sync_source_time_idx").on(table.sourceId, table.startedAt), uniqueIndex("epg_running_source_unique").on(table.sourceId).where(sql`status = 'running'`)]);

export const reminders = sqliteTable("reminders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  epgProgramId: text("epg_program_id").notNull().references(() => epgPrograms.id, { onDelete: "cascade" }),
  notifyAt: integer("notify_at", { mode: "timestamp_ms" }).notNull(),
  offsetMinutes: integer("offset_minutes").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("reminder_user_program_unique").on(table.userId, table.epgProgramId), index("reminder_active_time_idx").on(table.userId, table.active, table.notifyAt)]);

export const conversationSessions = sqliteTable("conversation_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("New conversation"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("conversation_user_updated_idx").on(table.userId, table.updatedAt)]);

export const conversationMessages = sqliteTable("conversation_messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => conversationSessions.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  blocksJson: text("blocks_json"),
  createdAt: createdAt(),
}, (table) => [index("message_session_time_idx").on(table.sessionId, table.createdAt)]);

export const conversationDisplayedItems = sqliteTable("conversation_displayed_items", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => conversationSessions.id, { onDelete: "cascade" }),
  messageId: text("message_id").notNull().references(() => conversationMessages.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  contentType: text("content_type", { enum: ["movie", "series", "episode", "liveEvent"] }).notNull(),
  externalId: text("external_id").notNull(),
  metadataJson: text("metadata_json"),
  createdAt: createdAt(),
}, (table) => [index("display_session_recent_idx").on(table.sessionId, table.createdAt), uniqueIndex("display_message_position_unique").on(table.messageId, table.position)]);

export const userEvents = sqliteTable("user_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  mediaType: text("media_type"),
  tmdbId: integer("tmdb_id"),
  strength: real("strength").notNull(),
  metadataJson: text("metadata_json"),
  createdAt: createdAt(),
}, (table) => [index("event_user_time_idx").on(table.userId, table.createdAt)]);

export const sessionContext = sqliteTable("session_context", {
  conversationSessionId: text("conversation_session_id").primaryKey().references(() => conversationSessions.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  contextJson: text("context_json").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: updatedAt(),
}, (table) => [index("context_user_expiry_idx").on(table.userId, table.expiresAt)]);

export const tmdbCache = sqliteTable("tmdb_cache", {
  cacheKey: text("cache_key").primaryKey(),
  kind: text("kind").notNull(),
  payloadJson: text("payload_json").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("tmdb_cache_expiry_idx").on(table.expiresAt)]);

export const aiUsage = sqliteTable("ai_usage", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  usageDate: text("usage_date").notNull(),
  messageCount: integer("message_count").notNull().default(0),
  updatedAt: updatedAt(),
}, (table) => [primaryKey({ columns: [table.userId, table.usageDate] })]);

export const schema = {
  user, session, account, verification, profiles, userStreamingServices,
  userLanguagePreferences, userTastePreferences, userTitleFeedback, watchlist,
  watchHistory, channels, channelFavorites, epgPrograms, epgTmdbMatches, epgSyncRuns, reminders,
  conversationSessions, conversationMessages, conversationDisplayedItems,
  userEvents, sessionContext, tmdbCache, aiUsage,
};
