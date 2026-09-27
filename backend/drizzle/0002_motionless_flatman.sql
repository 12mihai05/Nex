ALTER TABLE `channels` ADD `country` text DEFAULT 'RO' NOT NULL;--> statement-breakpoint
ALTER TABLE `channels` ADD `canonical_id` text;--> statement-breakpoint
CREATE INDEX `channel_country_idx` ON `channels` (`country`);--> statement-breakpoint
ALTER TABLE `user_taste_preferences` ADD `evidence_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_taste_preferences` ADD `explicit` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_taste_preferences` ADD `last_evidence_at` integer;