CREATE TABLE `channel_favorites` (
	`user_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `channel_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `favorite_channel_idx` ON `channel_favorites` (`channel_id`);--> statement-breakpoint
ALTER TABLE `watchlist` ADD `traits_json` text DEFAULT '[]' NOT NULL;