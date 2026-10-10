CREATE TABLE `release_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`event_key` text NOT NULL,
	`country` text NOT NULL,
	`media_type` text NOT NULL,
	`tmdb_id` integer NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`release_date` text NOT NULL,
	`read_at` integer,
	`popup_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subscription_id`) REFERENCES `release_subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `release_notification_once` ON `release_notifications` (`subscription_id`,`event_key`);--> statement-breakpoint
CREATE INDEX `release_notification_inbox` ON `release_notifications` (`user_id`,`country`,`created_at`,`id`);