# Global free EPG

## Selected source

On 2026-09-26, direct downloads and parsing showed EPGShare01 to be the strongest tested Romania source. Its RO1 feed contained 370 channels and 43,950 programmes, with 353 current broadcasts at the observation time and schedules through September 30. PRO TV, Antena 1, TVR 1, Digi 24 and Digi Sport were present. Its Bulgaria feed contained 86 channels, 4,591 programmes and 56 current broadcasts, through September 28.

These are observations, not a guarantee of long-term maintenance or perfect schedule accuracy. Romania's IPTV-EPG.org endpoint could not be fetched in this environment; EPG.pw's tested Romania file returned a non-success status. France initially exceeded the old 30 MB decompressed bound; after a deliberate increase to 75 MB, France and Switzerland downloaded, parsed and imported successfully. No source is claimed to be best globally.

- [EPGShare01 country files](https://epgshare01.online/epgshare01/)
- [Romania XMLTV gzip](https://epgshare01.online/epgshare01/epg_ripper_RO1.xml.gz)
- [Bulgaria XMLTV gzip](https://epgshare01.online/epgshare01/epg_ripper_BG1.xml.gz)
- [iptv-org API contract](https://github.com/iptv-org/api)
- [iptv-org guide tooling](https://github.com/iptv-org/epg)

The live iptv-org API returned global channel, feed and guide metadata, but its examined guide entries had no hosted XMLTV source URLs. It remains useful for canonical channel identifiers, country and broadcast-area metadata. It must not be described as the actual schedule host in this configuration.

## Configuration and global behavior

`EPG_SOURCE_TYPE=iptv-org` selects the global coordinator. The database source identifier remains `iptv-org:COUNTRY` for stable identity; configured schedule bytes currently come from EPGShare01. `EPG_COUNTRIES=RO,BG,GB,ES,FR,CH,IT,DE,MD` controls scheduled imports. `EPG_COUNTRY_SOURCES_JSON` maps country codes to public XML/XML.gz files and takes precedence over directory-hosted sources. Without an override or hosted directory source, the coordinator discovers an existing country file from EPGShare01's index (including GB→UK), rather than inventing file URLs. It is configurable for other countries without mirroring all countries into Turso. A country without an available feed reports a source error and the streaming catalog still works.

Metadata failures do not block explicit country feeds. Feed failures preserve the last complete in-window schedule. Multiple configured feeds are a combined snapshot: a partial download failure does not replace a complete schedule with partial data. Stale feeds with no upcoming/current programmes are rejected. TV queries filter on the viewer's country.

Defaults import schedules for 60 selected channels per country, plus explicitly favorited channels outside that selection. The full valid lightweight country channel directory is kept searchable even without imported programmes. Favorites are limited to 20 per user per country and 120 distinct requested channels per country; a newly selected channel obtains its schedule on the next successful sync. Import bounds remain three files, 75 MB transport/decompressed data and five TMDB match attempts. Core channels seed the default selection, then canonical channels and stable alphabetical order. Known adult channels are excluded. Withdrawn channels become inactive transactionally, disappear from programme queries, and remain removable from existing favorites. Historical programmes can outlive channel activation until retention expires.

TV is separate from Streaming. Live programmes rank favorites first, then start time, channel name and stable programme ID. Upcoming results first use next-30-minute, 30–60-minute and later buckets, then the same favorite/time/tie order. Compact previews reserve roughly one third of slots for nonfavorites when available; the full searchable guide remains accessible, with an optional favorites filter. Channel favorites never train movie taste. Favorite ownership and selected-country constraints are enforced server-side.

The final live sync imported RO 6,412; BG 5,571; GB 5,587; ES 6,154; FR 5,557; CH 6,943; IT 9,140; DE 6,284; MD 1,045 programme rows. Counts vary with upstream schedules and retained past data. All nine countries passed authenticated current/upcoming queries and Settings switching tests.

Moldova has no dedicated file in the tested index. Its adapter selects only Moldova-associated channels from the shared Romania feed using iptv-org metadata; it does not relabel the full Romanian lineup. Six channels were verified, including Moldova TV, Orizont TV and TVR Moldova plus shared channels. This is limited coverage, not a complete Moldovan national lineup. A tested alternative failed download; a global aggregate exceeded bounded download limits. A better authorized public source can be supplied through the existing override.

Each user has one saved country. Ordinary TV endpoints use that profile, ignoring a query-string country override. Settings clears old regional content before loading the new region. Chat may temporarily answer another country only when the current message explicitly asks for it; it neither updates Settings nor carries that country into an unnamed follow-up. The live country verification script tests these boundaries.

## Ingestion and security

### September 27 configuration review: RO1 versus RO2

The two-country JSON example is intentional: it is a map of **overrides**, not the list of enabled countries. `EPG_COUNTRIES` enables imports for all nine listed countries; omitted JSON entries use the directory/discovery path. The first discovered country file is used within the free-first limits. GB maps to UK filenames, and Moldova retains its strict metadata-filtered Romania fallback. Do not add an unfiltered RO feed as a Moldova override, which would label the Romanian lineup as Moldovan.

Both Romanian gzip files were downloaded and parsed again on September 27. RO1 had 370 channels, 45,187 programme entries and 358 current broadcasts; RO2 had 148 channels but only 223 programme entries and three current broadcasts. Normalized display names overlapped for 132 of RO2's 148 channels; most remaining names looked like variants, although name normalization alone cannot prove identical schedules. These counts are a point-in-time diagnostic, not permanent provider characteristics.

Kept RO1 only. RO2 is not a mandatory second half of RO1, and blindly combining them would add sparse data, possible duplicate channel variants, and another required dependency under the complete-snapshot policy. Configured arrays are merged sources, **not ordered failover URLs**. No secrets or local `.env` values needed changing. Recheck with `node --import tsx backend/scripts/inspect-epg-feeds.ts` if feed quality changes. Upstream references: [country index](https://epgshare01.online/epgshare01/), [RO1 lineup](https://epgshare01.online/epgshare01/epg_ripper_RO1.txt), [RO2 lineup](https://epgshare01.online/epgshare01/epg_ripper_RO2.txt).

The local configuration was checked without printing secrets: live coordinator mode, all nine enabled countries, RO/BG overrides only. A fresh authenticated `verify-countries.ts` run passed for all nine countries, including explicit France Chat override without Settings mutation and return to Romania on an unnamed follow-up. Its temporary account was deleted. Moldova remains limited to six live channels; this is not full national coverage.

XMLTV gzip is detected by magic bytes. Downloads require HTTPS, reject redirects, credentials in URLs and private IP destinations, have a deadline and size cap, and reject entity declarations/internal DTD subsets. Standard external XMLTV DTD declarations are stripped without fetching. Malformed individual programme rows are skipped. Valid timezone offsets are normalized to UTC. IDs are stable; upserts and replacement of future snapshots are transactional. Country sync has a database uniqueness lease to prevent overlapping imports, with expiry after 15 minutes.

Retention removes rows outside seven past/fourteen future days even when the upstream feed fails. The source cannot supply more future days than it actually publishes. Successful snapshots replace superseded future entries; past history remains until retention expires. Sync metadata is retained for 30 days. TMDB matching is bounded and conservative, uses country/year-aware cache identity, and rejects ambiguous near-ties; unmatched programmes remain useful TV listings.

## Free schedule

The GitHub Actions workflow runs the sync CLI directly against Turso once daily, avoiding long ingestion through a Vercel request. It needs repository secrets `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and optionally `TMDB_READ_ACCESS_TOKEN`. Public configuration goes in repository variables `EPG_COUNTRIES` and `EPG_COUNTRY_SOURCES_JSON`. It neither needs nor receives the OpenAI API key. There is no paid EPG provider or always-on worker. GitHub Actions must remain within the repository's included allowance.

Manual sync: `npm --workspace backend run epg:sync`. The protected HTTP endpoint remains available for small/operator-triggered runs with `EPG_SYNC_SECRET`, but is not the scheduler. The workflow has not been activated remotely by this implementation run; no commit or push was requested.
