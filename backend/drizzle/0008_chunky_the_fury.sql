CREATE TABLE `push_devices` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `push_device_user` ON `push_devices` (`user_id`);--> statement-breakpoint
CREATE TABLE `release_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`event_key` text NOT NULL,
	`token_hash` text NOT NULL,
	`sent` integer DEFAULT false NOT NULL,
	`attempt_at` integer NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `release_subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `release_delivery_once` ON `release_deliveries` (`subscription_id`,`event_key`,`token_hash`);--> statement-breakpoint
CREATE TABLE `release_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`follow_seen_series` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `release_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`media_type` text NOT NULL,
	`tmdb_id` integer NOT NULL,
	`kind` text NOT NULL,
	`country` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`baseline_json` text DEFAULT '[]' NOT NULL,
	`initialized` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`checked_at` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `release_subscription_identity` ON `release_subscriptions` (`user_id`,`media_type`,`tmdb_id`,`kind`,`country`);--> statement-breakpoint
CREATE INDEX `release_subscription_due` ON `release_subscriptions` (`enabled`,`checked_at`);