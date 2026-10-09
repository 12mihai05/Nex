ALTER TABLE `profiles` ADD `recommendation_engine` text DEFAULT 'baseline' NOT NULL;
--> statement-breakpoint
CREATE TABLE `content_embeddings` (
  `key` text PRIMARY KEY NOT NULL,
  `vector_json` text NOT NULL,
  `expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `content_embeddings_expiry_idx` ON `content_embeddings` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `user_recommendation_cache` (
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `key` text NOT NULL,
  `payload_json` text NOT NULL,
  `expires_at` integer NOT NULL,
  PRIMARY KEY (`user_id`, `key`)
);
--> statement-breakpoint
CREATE INDEX `recommendation_cache_expiry_idx` ON `user_recommendation_cache` (`expires_at`);
