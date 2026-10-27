CREATE TABLE `cinema_listings` (
	`chain` text NOT NULL,
	`source_id` text NOT NULL,
	`tmdb_id` integer,
	`run_date` text,
	`source_url` text NOT NULL,
	`date_kind` text NOT NULL,
	`current` integer NOT NULL,
	`upcoming` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`first_observed_at` integer NOT NULL,
	`date_observed_at` integer NOT NULL,
	`missing_since` integer,
	`last_absent_at` integer,
	`missing_checks` integer DEFAULT 0 NOT NULL,
	`facts_hash` text NOT NULL,
	PRIMARY KEY(`chain`, `source_id`)
);
--> statement-breakpoint
CREATE INDEX `cinema_listing_title_active` ON `cinema_listings` (`tmdb_id`,`active`);--> statement-breakpoint
CREATE INDEX `cinema_listing_future` ON `cinema_listings` (`run_date`,`active`);--> statement-breakpoint
CREATE TABLE `cinema_mappings` (
	`chain` text NOT NULL,
	`source_id` text NOT NULL,
	`tmdb_id` integer,
	`title` text NOT NULL,
	`identity_hash` text NOT NULL,
	`evidence_json` text NOT NULL,
	`movie_json` text,
	`checked_at` integer NOT NULL,
	`date_history_json` text DEFAULT '[]' NOT NULL,
	PRIMARY KEY(`chain`, `source_id`)
);
--> statement-breakpoint
CREATE INDEX `cinema_mapping_title` ON `cinema_mappings` (`tmdb_id`);--> statement-breakpoint
CREATE TABLE `cinema_sources` (
	`chain` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`checked_at` integer DEFAULT 0 NOT NULL,
	`attempted_at` integer DEFAULT 0 NOT NULL,
	`health` text DEFAULT 'pending' NOT NULL,
	`current_count` integer DEFAULT 0 NOT NULL,
	`upcoming_count` integer DEFAULT 0 NOT NULL,
	`snapshot_hash` text DEFAULT '' NOT NULL
);
