CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_provider_unique` ON `account` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `ai_usage` (
	`user_id` text NOT NULL,
	`usage_date` text NOT NULL,
	`message_count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `usage_date`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `channels` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`external_id` text NOT NULL,
	`display_name` text NOT NULL,
	`logo_url` text,
	`language` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `channel_source_external_unique` ON `channels` (`source_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `conversation_displayed_items` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`message_id` text NOT NULL,
	`position` integer NOT NULL,
	`content_type` text NOT NULL,
	`external_id` text NOT NULL,
	`metadata_json` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `conversation_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `conversation_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `display_session_recent_idx` ON `conversation_displayed_items` (`session_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `display_message_position_unique` ON `conversation_displayed_items` (`message_id`,`position`);--> statement-breakpoint
CREATE TABLE `conversation_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`blocks_json` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `conversation_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `message_session_time_idx` ON `conversation_messages` (`session_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `conversation_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text DEFAULT 'New conversation' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversation_user_updated_idx` ON `conversation_sessions` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `epg_programs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`source_program_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`title` text NOT NULL,
	`subtitle` text,
	`description` text,
	`start_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`category` text,
	`language` text,
	`year` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `epg_source_program_unique` ON `epg_programs` (`source_id`,`source_program_id`);--> statement-breakpoint
CREATE INDEX `epg_channel_time_idx` ON `epg_programs` (`channel_id`,`start_at`);--> statement-breakpoint
CREATE INDEX `epg_time_idx` ON `epg_programs` (`start_at`,`end_at`);--> statement-breakpoint
CREATE TABLE `epg_sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`source_timestamp` integer,
	`imported_rows` integer DEFAULT 0 NOT NULL,
	`deleted_rows` integer DEFAULT 0 NOT NULL,
	`error_code` text
);
--> statement-breakpoint
CREATE INDEX `epg_sync_source_time_idx` ON `epg_sync_runs` (`source_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `epg_tmdb_matches` (
	`normalized_title` text NOT NULL,
	`media_type` text NOT NULL,
	`tmdb_id` integer NOT NULL,
	`confidence` real NOT NULL,
	`evidence_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`normalized_title`, `media_type`)
);
--> statement-breakpoint
CREATE INDEX `epg_match_tmdb_idx` ON `epg_tmdb_matches` (`tmdb_id`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`country` text DEFAULT 'RO' NOT NULL,
	`timezone` text DEFAULT 'Europe/Bucharest' NOT NULL,
	`onboarding_complete` integer DEFAULT false NOT NULL,
	`appearance` text DEFAULT 'system' NOT NULL,
	`behavior_personalization` integer DEFAULT true NOT NULL,
	`reminders_enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`epg_program_id` text NOT NULL,
	`notify_at` integer NOT NULL,
	`offset_minutes` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`epg_program_id`) REFERENCES `epg_programs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reminder_user_program_unique` ON `reminders` (`user_id`,`epg_program_id`);--> statement-breakpoint
CREATE INDEX `reminder_active_time_idx` ON `reminders` (`user_id`,`active`,`notify_at`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_token_idx` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `session_context` (
	`conversation_session_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`context_json` text NOT NULL,
	`expires_at` integer NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`conversation_session_id`) REFERENCES `conversation_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `context_user_expiry_idx` ON `session_context` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `tmdb_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`payload_json` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tmdb_cache_expiry_idx` ON `tmdb_cache` (`expires_at`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `user_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`event_type` text NOT NULL,
	`media_type` text,
	`tmdb_id` integer,
	`strength` real NOT NULL,
	`metadata_json` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_user_time_idx` ON `user_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `user_language_preferences` (
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`language_code` text NOT NULL,
	`prefer_original` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `kind`, `language_code`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_streaming_services` (
	`user_id` text NOT NULL,
	`provider_id` integer NOT NULL,
	`provider_name` text NOT NULL,
	`logo_path` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `provider_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `streaming_user_idx` ON `user_streaming_services` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_taste_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`dimension` text NOT NULL,
	`key` text NOT NULL,
	`score` real NOT NULL,
	`confidence` real NOT NULL,
	`evidence_count` integer DEFAULT 1 NOT NULL,
	`source` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `taste_user_dimension_key_unique` ON `user_taste_preferences` (`user_id`,`dimension`,`key`);--> statement-breakpoint
CREATE INDEX `taste_user_idx` ON `user_taste_preferences` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_title_feedback` (
	`user_id` text NOT NULL,
	`media_type` text NOT NULL,
	`tmdb_id` integer NOT NULL,
	`reaction` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `media_type`, `tmdb_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `feedback_user_idx` ON `user_title_feedback` (`user_id`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `watch_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`media_type` text NOT NULL,
	`tmdb_id` integer NOT NULL,
	`watched_at` integer NOT NULL,
	`title_snapshot` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `history_user_watched_idx` ON `watch_history` (`user_id`,`watched_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `history_user_title_unique` ON `watch_history` (`user_id`,`media_type`,`tmdb_id`);--> statement-breakpoint
CREATE TABLE `watchlist` (
	`user_id` text NOT NULL,
	`media_type` text NOT NULL,
	`tmdb_id` integer NOT NULL,
	`title_snapshot` text NOT NULL,
	`poster_path` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `media_type`, `tmdb_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `watchlist_user_created_idx` ON `watchlist` (`user_id`,`created_at`);