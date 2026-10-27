import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);
const updatedAt = () => integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);

export const cinemaSources=sqliteTable('cinema_sources',{
  chain:text('chain').primaryKey(),version:integer('version').notNull().default(0),
  checkedAt:integer('checked_at').notNull().default(0),attemptedAt:integer('attempted_at').notNull().default(0),
  health:text('health').notNull().default('pending'),currentCount:integer('current_count').notNull().default(0),upcomingCount:integer('upcoming_count').notNull().default(0),snapshotHash:text('snapshot_hash').notNull().default(''),
});
export const cinemaMappings=sqliteTable('cinema_mappings',{
  chain:text('chain').notNull(),sourceId:text('source_id').notNull(),tmdbId:integer('tmdb_id'),
  title:text('title').notNull(),identityHash:text('identity_hash').notNull(),evidenceJson:text('evidence_json').notNull(),
  movieJson:text('movie_json'),checkedAt:integer('checked_at').notNull(),
  // Last dated provenance survives inactive listing cleanup; never user data.
  dateHistoryJson:text('date_history_json').notNull().default('[]'),
},t=>[primaryKey({columns:[t.chain,t.sourceId]}),index('cinema_mapping_title').on(t.tmdbId)]);
export const cinemaListings=sqliteTable('cinema_listings',{
  chain:text('chain').notNull(),sourceId:text('source_id').notNull(),tmdbId:integer('tmdb_id'),
  runDate:text('run_date'),sourceUrl:text('source_url').notNull(),dateKind:text('date_kind').notNull(),
  current:integer('current',{mode:'boolean'}).notNull(),upcoming:integer('upcoming',{mode:'boolean'}).notNull(),
  active:integer('active',{mode:'boolean'}).notNull().default(true),
  firstObservedAt:integer('first_observed_at').notNull(),dateObservedAt:integer('date_observed_at').notNull(),
  missingSince:integer('missing_since'),lastAbsentAt:integer('last_absent_at'),missingChecks:integer('missing_checks').notNull().default(0),
  factsHash:text('facts_hash').notNull(),
},t=>[primaryKey({columns:[t.chain,t.sourceId]}),index('cinema_listing_title_active').on(t.tmdbId,t.active),index('cinema_listing_future').on(t.runDate,t.active)]);

export const releaseSettings = sqliteTable('release_settings', {
  userId:text('user_id').primaryKey().references(()=>user.id,{onDelete:'cascade'}),
  followSeenSeries:integer('follow_seen_series',{mode:'boolean'}).notNull().default(false),
});
export const releaseSubscriptions = sqliteTable('release_subscriptions', {
  id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>user.id,{onDelete:'cascade'}),
  mediaType:text('media_type',{enum:['movie','series']}).notNull(),tmdbId:integer('tmdb_id').notNull(),
  kind:text('kind',{enum:['cinema','digital','season']}).notNull(),country:text('country').notNull(),
  enabled:integer('enabled',{mode:'boolean'}).notNull().default(true),
  baselineJson:text('baseline_json').notNull().default('[]'),
  initialized:integer('initialized',{mode:'boolean'}).notNull().default(false),
  createdAt:createdAt(),checkedAt:integer('checked_at',{mode:'timestamp_ms'}).notNull().default(sql`0`),
},t=>[uniqueIndex('release_subscription_identity').on(t.userId,t.mediaType,t.tmdbId,t.kind,t.country),index('release_subscription_due').on(t.enabled,t.checkedAt)]);
// Legacy unused tables: retained to avoid destructive migration. No active push routes.
export const pushDevices = sqliteTable('push_devices', {
  token:text('token').primaryKey(), userId:text('user_id').notNull().references(()=>user.id,{onDelete:'cascade'}),
  sessionId:text('session_id').notNull().references(()=>session.id,{onDelete:'cascade'}),
  updatedAt:updatedAt(),
},t=>[index('push_device_user').on(t.userId)]);
export const releaseDeliveries = sqliteTable('release_deliveries', {
  id:text('id').primaryKey(),subscriptionId:text('subscription_id').notNull().references(()=>releaseSubscriptions.id,{onDelete:'cascade'}),
  eventKey:text('event_key').notNull(),tokenHash:text('token_hash').notNull(),
  sent:integer('sent',{mode:'boolean'}).notNull().default(false),attemptAt:integer('attempt_at',{mode:'timestamp_ms'}).notNull(),
},t=>[uniqueIndex('release_delivery_once').on(t.subscriptionId,t.eventKey,t.tokenHash)]);

export const releaseNotifications = sqliteTable('release_notifications', {
  id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>user.id,{onDelete:'cascade'}),
  subscriptionId:text('subscription_id').notNull().references(()=>releaseSubscriptions.id,{onDelete:'cascade'}),
  eventKey:text('event_key').notNull(),country:text('country').notNull(),
  mediaType:text('media_type',{enum:['movie','series']}).notNull(),tmdbId:integer('tmdb_id').notNull(),
  title:text('title').notNull(),body:text('body').notNull(),releaseDate:text('release_date').notNull(),
  readAt:integer('read_at',{mode:'timestamp_ms'}),popupAt:integer('popup_at',{mode:'timestamp_ms'}),createdAt:createdAt(),
},t=>[uniqueIndex('release_notification_once').on(t.subscriptionId,t.eventKey),index('release_notification_inbox').on(t.userId,t.country,t.createdAt,t.id)]);

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
  recommendationEngine: text("recommendation_engine", { enum: ["baseline", "semantic", "semantic_ai"] }).notNull().default("baseline"),
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

// Public catalog representations contain no user preferences or account data.
export const contentEmbeddings = sqliteTable("content_embeddings", {
  key: text("key").primaryKey(),
  vectorJson: text("vector_json").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
}, table => [index("content_embeddings_expiry_idx").on(table.expiresAt)]);

export const userRecommendationCache = sqliteTable("user_recommendation_cache", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  payloadJson: text("payload_json").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
}, table => [primaryKey({ columns: [table.userId, table.key] }), index("recommendation_cache_expiry_idx").on(table.expiresAt)]);

export const userTasteSummaries = sqliteTable('user_taste_summaries', {
  userId: text('user_id').primaryKey().references(() => user.id, {onDelete:'cascade'}),
  paragraph: text('paragraph'),
  fingerprint: text('fingerprint'),
  updatedAt: integer('updated_at', {mode:'timestamp_ms'}),
  attemptedAt: integer('attempted_at', {mode:'timestamp_ms'}).notNull(),
});

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
  posterPath: text("poster_path"),
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

export const epgCountryDemand = sqliteTable('epg_country_demand', {
  country: text('country').primaryKey(),
  everSelected: integer('ever_selected', {mode:'boolean'}).notNull().default(false),
  inactiveSince: integer('inactive_since', {mode:'timestamp_ms'}),
  requestedAt: integer('requested_at', {mode:'timestamp_ms'}),
});

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
  memoryJson: text("memory_json"),
  memoryLeaseToken: text("memory_lease_token"),
  memoryLeaseUntil: integer("memory_lease_until").notNull().default(0),
  title: text("title").notNull().default("New conversation"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("conversation_user_updated_idx").on(table.userId, table.updatedAt)]);

export const chatRequests=sqliteTable('chat_requests',{
  userId:text('user_id').notNull().references(()=>user.id,{onDelete:'cascade'}),
  requestId:text('request_id').notNull(),payloadHash:text('payload_hash').notNull(),
  status:text('status',{enum:['running','completed','interrupted']}).notNull(),
  responseJson:text('response_json'),createdAt:createdAt(),updatedAt:updatedAt(),
},table=>[primaryKey({columns:[table.userId,table.requestId]}),uniqueIndex('chat_one_active_user').on(table.userId).where(sql`${table.status} = 'running'`)]);

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
  conversationSessions, conversationMessages, conversationDisplayedItems, chatRequests,
  userEvents, sessionContext, tmdbCache, aiUsage, contentEmbeddings, userRecommendationCache,
};
