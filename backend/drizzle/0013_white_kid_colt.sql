CREATE TABLE `user_taste_summaries` (
	`user_id` text PRIMARY KEY NOT NULL,
	`paragraph` text,
	`fingerprint` text,
	`updated_at` integer,
	`attempted_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
