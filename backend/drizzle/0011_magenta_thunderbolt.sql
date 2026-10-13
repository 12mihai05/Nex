ALTER TABLE `epg_country_demand` ADD `ever_selected` integer DEFAULT false NOT NULL;
--> statement-breakpoint
INSERT INTO epg_country_demand(country, ever_selected, inactive_since)
SELECT country, 1, NULL FROM profiles GROUP BY country;
--> statement-breakpoint
INSERT OR IGNORE INTO epg_country_demand(country, ever_selected, inactive_since)
SELECT country, 0, unixepoch()*1000 FROM channels GROUP BY country;
--> statement-breakpoint
CREATE TRIGGER epg_profile_insert AFTER INSERT ON profiles BEGIN
  INSERT INTO epg_country_demand(country,ever_selected,inactive_since) VALUES(NEW.country,1,NULL)
  ON CONFLICT(country) DO UPDATE SET ever_selected=1,inactive_since=NULL;
END;
--> statement-breakpoint
CREATE TRIGGER epg_profile_country AFTER UPDATE OF country ON profiles WHEN OLD.country<>NEW.country BEGIN
  UPDATE epg_country_demand SET inactive_since=unixepoch()*1000
  WHERE country=OLD.country AND NOT EXISTS(SELECT 1 FROM profiles WHERE country=OLD.country);
  INSERT INTO epg_country_demand(country,ever_selected,inactive_since) VALUES(NEW.country,1,NULL)
  ON CONFLICT(country) DO UPDATE SET ever_selected=1,inactive_since=NULL;
END;
--> statement-breakpoint
CREATE TRIGGER epg_profile_delete AFTER DELETE ON profiles BEGIN
  UPDATE epg_country_demand SET inactive_since=unixepoch()*1000
  WHERE country=OLD.country AND NOT EXISTS(SELECT 1 FROM profiles WHERE country=OLD.country);
END;
--> statement-breakpoint
CREATE INDEX profiles_country_idx ON profiles(country);
