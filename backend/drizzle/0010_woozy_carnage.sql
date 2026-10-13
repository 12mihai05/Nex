CREATE TABLE `epg_country_demand` (
	`country` text PRIMARY KEY NOT NULL,
	`inactive_since` integer,
	`requested_at` integer
);
