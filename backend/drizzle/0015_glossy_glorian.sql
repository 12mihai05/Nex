ALTER TABLE `conversation_sessions` ADD `memory_json` text;--> statement-breakpoint
ALTER TABLE `conversation_sessions` ADD `memory_lease_token` text;--> statement-breakpoint
ALTER TABLE `conversation_sessions` ADD `memory_lease_until` integer DEFAULT 0 NOT NULL;