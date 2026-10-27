# Romanian cinema import

Implementation started 28 October 2026. Two factual national-chain adapters, no new service, no AI extraction, no venue/showtime database. Public website endpoints are not supported third-party APIs. Respect access failures; no browser challenge bypass or aggressive retries. Source names/links accompany dates. The implementation reports **Listed at**, not a guaranteed screening today.

## Build sequence

1. Push the verified existing UI changes (done: 3cde4d3).
2. Fix missing synopsis language fallback and honest missing synopsis/credits states. Live audit: TMDb 1679416 has Romanian overview and credits, but no English overview; 19899 is a different film sharing its Romanian title.
3. Add validated source adapters, conservative TMDb identity matching, persistent mappings, atomic per-chain snapshots, independent failures, stale suppression and confirmed-absence retention. Cinema-run year never substitutes for original production year.
4. Extend the existing catalog release/upcoming boundary. Shared data for details, Chat and alerts; no fetching cinema sites during app requests. Initial-source backfills and reissues cannot generate first-premiere alerts. Freeze supplemental Upcoming membership per country/day to keep numbered pagination stable; filter duplicate canonical IDs out of subsequent TMDb pages.
5. Add small movie-detail source labels and re-release wording. Preserve original movie dates and all user data.
6. Test synthetic adversarial cases, actual public source payloads, live TMDb matching, local migrated database, two consecutive imports, failure/absence/reappearance, pagination, and full backend/mobile checks. Add disabled-by-default daily/manual GitHub workflow; enable only after the trial passes and document source limitations.

Public data is limited to source IDs, movie identity, dates, status and attribution. Do not store cinema HTML, images, synopses, venue IDs or raw source payloads. Persist normalized TMDb cards for supplemental Upcoming results. Protect all personalized endpoints with existing authentication; shared import tables contain no user data.

Controls: source byte/time limits; strict full-list validation; empty or >50% population loss quarantined; two healthy absences at least 12 hours apart before removal; current claims hidden after 72 hours; absent listing records removed after 30 days, minimal mappings and dated provenance retained. Updates are transactional per chain, with an optimistic version check against concurrent workers. A failed source never removes existing records. Optional supplement failure must not break TMDb detail or digital/season alerts.

Rollback: disable CINEMA_IMPORT_ENABLED and the workflow variable; existing TMDb-only behavior remains available. Additive migrations do not modify user rows. Production enablement and live outcomes will be recorded after verification.

## Implementation and verification

- Production Turso migration `0016_real_klaw.sql` applied successfully; existing user/profile counts remained 1/1.
- Initial production import completed in two bounded passes: Cineplexx 91 source variants, 57 confidently matched; Cinema City 105 variants, 65 matched. All source entries participate in membership tracking, including unresolved entries. Variants are not unique movies. Unresolved theatre/concert/event entries and insufficiently identified movies are withheld, never guessed.
- Local repeat import: 0 changed listings, 0 matching requests; both chains completed in under half a second combined. Remote cold/bootstrap work is slower and runs only in the scheduler.
- Backend full check/build passed: 417 tests; an additional transient-database regression then passed with all 18 cinema tests. Flutter full suite passed: 139 tests, 20 pre-existing skips; analyzer clean. Light/dark cinema-card renders reviewed, including large text tests.
- Verified failures: malformed/empty/oversized payloads, HTTP/HTML errors, suspicious population drops, chain isolation, stale sources, duplicate variants, ambiguous identities, reissues, conflicting dates, initial backfills, spaced absence/removal/reappearance, unchanged imports, concurrent publishers, matching budgets, stable Upcoming pagination and country isolation.
- Fixed a related regional-date bug: Upcoming now checks actual country-specific TMDb theatrical dates instead of presenting a worldwide premiere as Romania's date.
- Secret scan: 1,449 text artifacts checked, no configured secret values found. No OpenAI calls are used by import/matching.

### Operation

`CINEMA_IMPORT_ENABLED=true` enables the production read integration. The matching GitHub repository variable enables `.github/workflows/cinema-sync.yml`, daily at 07:17 UTC and manually dispatchable. It uses the existing encrypted Turso/TMDb secrets; no extra provider keys. The release-alert workflow receives the same flag and uses the shared resolver.

Manual sync: `npx tsx backend/scripts/sync-cinema.ts --apply` with the feature flag enabled. Omit `--apply` for a read/matching trial (TMDb public cache may still populate). `--local --apply` writes only the isolated local cinema trial database. Source failures return a nonzero status and retain the last healthy data. A partial identity batch resumes on the next run; unmatched identities retry daily, verified identities refresh after 30 days.

No location-level screenings are promised. "Listed at" reflects a chain's national catalog; a cinema run can be a reissue or delayed local opening. Unknown identities remain unavailable until evidence is sufficient. Public website endpoints can change or become unavailable, so this is not guaranteed complete coverage of Romanian cinemas. First-premiere alerts deliberately exclude reissues and past-date backfills. Confirmed listings disappear after two healthy absences, not immediately on a transient failure. Minimal identity/date provenance remains after inactive listing cleanup; user history and movie records are never deleted by this importer.

Upcoming supplemental membership is frozen per calendar day for stable numbered pagination; a newly imported title may appear the next day if that day's snapshot was already opened. This does not delay fresh detail-page dates. Source freshness is 72 hours, with up to one additional daily Upcoming snapshot lifetime. Device notification delivery and physical Samsung rendering still require the user's phone check.
