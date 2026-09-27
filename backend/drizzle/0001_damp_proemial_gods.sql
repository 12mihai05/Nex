ALTER TABLE `epg_programs` ADD `matched_tmdb_id` integer;--> statement-breakpoint
ALTER TABLE `epg_programs` ADD `matched_media_type` text;--> statement-breakpoint
ALTER TABLE `epg_programs` ADD `match_confidence` real;