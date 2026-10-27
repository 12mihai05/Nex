# Romanian cinema listings and dates: implementation proposal

Research date: 28 October 2026, Europe/Bucharest.
Status: research and planning only. No runtime changes, migrations, scheduled imports, deployments, or production data writes in this pass.

## Product scope

- Cinema City Romania and Cineplexx Romania only. Aggregate nationwide per chain; no user city, venue selection, ticket prices, seat availability, or showtime database.
- Show an independently sourced Romanian theatrical release date and zero, one, or two currently listed chains.
- Remove a chain from the active cinema section when its complete national current listing no longer contains any variant of the film, subject to the safeguards below. Hide the active cinema section when no fresh chain association remains. Restore it on reappearance.
- Keep the historical release date and canonical movie identity. Never delete movie metadata, ratings, history, watchlist entries, or Taste because a cinema listing disappeared.
- Upcoming, active cinema presence, and historical premiere dates are distinct. A future date or advance ticket sale does not prove current exhibition. No tracked chain presence does not mean the film is absent from every Romanian cinema.

## Existing implementation reviewed

- `backend/src/repositories/tmdb-repository.ts`: `releases()` makes a fresh TMDb detail/release-date lookup. `upcoming()` uses paginated TMDb discover with the selected region and theatrical types 2/3; results are converted into metadata-only cards. This is the present Romanian coverage bottleneck; adding a date to details alone will not add missing films to Upcoming.
- `backend/src/domain/releases.ts`: dates are calendar strings, not timestamps shifted across timezones. Cinema release event keys are currently `cinema:RO`.
- `backend/src/app.ts`: the release-details endpoint fetches release facts and user subscriptions in parallel. Upcoming currently uses numbered pages. Personal alert state must remain user-scoped even though cinema facts are shared.
- `backend/src/services/release-tracking.ts`: daily subscribed-title checks, per-run lookup deduplication, baselines, country and opt-out checks, unique notification event keys. New-source backfills must not become a burst of old-release alerts.
- `backend/src/services/assistant-tools.ts`: `title_details` reads `catalog.releases`; `release_calendar` uses `ChatReleases`. The tool currently labels mixed returned facts as `source: 'tmdb'`; this must be corrected when supplementing cinema evidence.
- `backend/src/services/chat-releases.ts`: upcoming continuation buffers and title-specific release answers. These need the same date resolver and provenance as the app.
- `mobile/lib/src/widgets/release_details.dart`: already loads separately from the initial title display. Keep it independent of app startup. Do not label an expected theatrical date as proof a chain is showing a film.
- `.github/workflows/release-sync.yml`: once-daily Ubuntu job, concurrency guard, explicit enable variable, encrypted existing credentials. EPG has its own workflow. Cinema sync should be independently enabled, with failure isolation from EPG and season/digital alerts.

## Live source findings

Both websites expose structured JSON used by their own public frontend. The following read-only requests returned HTTP 200 without credentials, cookies, account creation, or browser automation. These are website implementation endpoints, NOT documented third-party APIs or a grant of reuse rights.

Cinema City:
- Homepage public JavaScript/configuration identifies tenant `10107` and `/ro/data-api-service`.
- `https://www.cinemacity.ro/ro/data-api-service/v1/feed/10107/allFeedNames` returned `now-playing` and `coming-soon`.
- `https://www.cinemacity.ro/ro/data-api-service/v1/feed/10107/byName/now-playing?lang=ro_RO`: 62 poster entries, 100,632 response-text bytes.
- `https://www.cinemacity.ro/ro/data-api-service/v1/feed/10107/byName/coming-soon?lang=ro_RO`: 43 entries, 67,661 bytes.
- Each entry includes a stable source code, title, source film URL, dateStarted and filmShowingType. Detail pages can supply director/original title when matching requires them.
- Of the 62 current-feed entries, 19 were dated after 28 October. All had filmShowingType SHOWING. Upcoming also included 12 SHOWING entries. Neither the feed name nor SHOWING alone proves a film is currently playing.

Cineplexx:
- The public frontend's movie service explicitly uses location=all for upcoming, and supports location on current-film requests.
- `https://app.cineplexx.ro/api/v2/movies?location=all`: 23 entries, 68,559 bytes.
- `https://app.cineplexx.ro/api/v2/movies/coming-soon?location=all`: 70 entries, 174,308 bytes.
- Responses include stable IDs, original/localized titles, directors, startDate, openingDate, comingSoon, isScheduledAtCinema and cinemaIds. Do not store venue IDs for this scope.
- All 23 current entries had isScheduledAtCinema=true, but 28 upcoming entries did too. A current film also had comingSoon=true. Raw booleans are not sufficient status logic.
- The incoming openingDate values include Romanian timezone offsets. Preserve the stated calendar date; do not convert local midnight into a previous-day UTC date.

Together, the four list responses were 411,160 response-text bytes (about 0.41 MB) before normalization/deduplication. This is a single live sample, not a long-term size guarantee, network-compression measurement, CI runtime benchmark, or completeness proof.

Both sources supplied these upcoming dates during the check:
- How to Rob a Bank / Cum sa spargi o banca: 2026-11-13.
- Dune: Part Three / Dune: Partea III: 2026-12-18.
- Avengers: Doomsday: 2026-12-18.

Additional useful counterexample: Dune and Dune: Part Two have forthcoming re-release dates. Cinema City listed 2026-11-27 while Cineplexx listed 2026-12-04. These chain dates must not replace the films' original Romanian premieres or be silently treated as a single agreed national release. Hungarian/dubbed versions also appear as separate source entries.

Earlier Wikidata check found no Romanian dates for the three requested films. A query for non-deprecated publication dates explicitly qualified with Romania, on entities with a TMDb movie ID, found 254 titles overall, 20 with 2026 dates, none dated 2026-10-28 or later. This is a query-specific coverage result, not proof no dates exist in article text or city-qualified statements. Do not add Wikidata for this feature now.

## Recommended architecture

Use two small source adapters, one scheduled worker, existing Turso, and a shared release resolver. No LLM extraction, browser farm, queue vendor, Redis, new paid API, or separate microservice.

1. Fetch both national lists per chain outside user requests. Prefer their structured website responses to brittle visible-page selectors. Validate response schema and completeness; follow pagination if introduced.
2. Normalize only relevant movie/date/status fields. Collapse source variants to one movie per chain, but retain the source-ID mappings so one disappearing variant does not remove a still-listed film.
3. Match new or materially changed entries against TMDb. Reuse confirmed mappings and existing metadata. Match original/localized/alternative titles with director/cast and original production year when available. Do not use the cinema run's year as the movie's production year; reissues disprove that shortcut. Do not use popularity or title similarity alone to settle ambiguous remakes. Skip unresolved entries for review/retry. No AI calls are required.
4. Validate full snapshots before publishing. Upsert changed normalized records in bounded transactions. Publish a chain's current snapshot atomically; never expose a half-written import. One failing chain must not erase the other.
5. Read shared cinema facts by country + TMDb ID. Reuse the existing release route/catalog boundary and return chain evidence as an additive field, not a second incompatible recommendation/catalog system. Run any remaining TMDb reads concurrently; cinema collection must never be requested by a phone refresh or awaited during Home bootstrap.
6. Upcoming must include matched supplement titles even when TMDb's regional discover omits them. Merge by canonical movie ID, preserve the existing pagination contract or use a backwards-compatible stable cursor, and test gaps/duplicates across updates. Do not just append supplementary titles to page one and then let them disappear from later pages. No streaming-provider or minimum-rating filters should suppress future cinema releases.
7. Details, Chat, upcoming cards and cinema alerts consume one date-resolution policy. Preserve original source links and freshness in tool data. Neither model knowledge nor another country's release date supplies missing Romanian evidence.

## State and freshness

The public UI can remain simple, but internally a boolean alone is insufficient. Track present, missing-pending-confirmation, and unknown/stale evidence independently from the premiere date.

- Add verified current membership immediately after a valid snapshot.
- A future-dated entry remains upcoming even if the source says SHOWING or tickets are on sale. A source's current-list membership plus a non-future run date is the initial conservative criterion; validate it against the actual website during the trial. Unknown/contradictory dates cannot be automatically promoted to current.
- This scope reports chain catalog presence, not proof of a screening today. If exact today's screenings are eventually required, that is a different feature needing session data. Prefer wording such as 'Listed at' over an exact-today claim.
- Remove a chain from active display after two consecutive healthy complete snapshots omit ALL mapped variants, separated by at least 12 hours. A manual rerun or HTTP retry must not count as another independent daily absence.
- Invalid JSON, 403/429/5xx, HTML challenge pages, timeouts, missing pagination, malformed dates, or suspicious population collapse do not count as absence. Quarantine an unexpected empty/mass-drop snapshot and report it. A legitimate all-empty snapshot needs explicit validation rather than permanent rejection.
- A conditional HTTP 304 can confirm a previous valid complete snapshot is still current; without that saved snapshot it is not usable evidence. Neither source returned validators in the sampled JSON responses, so do not rely on conditional HTTP savings.
- After 72 hours without a healthy current-list verification, suppress the active positive claim as unknown; do not persistently delete the association on failure. Recover on the next healthy snapshot.
- Keep a sourced historical premiere date. Upcoming dates older than the freshness policy should be marked last-confirmed rather than silently treated as newly verified; suppress new automated alerts from stale/conflicting evidence.
- Missing an upcoming list must never be interpreted as cancellation. Preserve the dated observation as last-known until replaced or reviewed; do not invent a cancellation or release.
- Use Europe/Bucharest calendar dates for RO, independent of an account's travel timezone.

## Minimal storage and retention

Use the existing catalog/cache for posters and descriptions. No copies of full HTML, full JSON payloads, images, venue schedules or session inventories in the production database.

Recommended small records:
- Per-source movie mapping: chain, stable source ID, TMDb ID, matching evidence/version. Keep this minimal mapping while the canonical movie is retained; it prevents repeated lookups and enables reappearance.
- Per-source date/listing observation: chain/source ID, date and date meaning (initial release, reissue, unknown), current/upcoming membership, first/last confirmed timestamps and missing-run count. Index chain/source ID and country/TMDb ID. Store exact source provenance for date resolution.
- Per-source sync state: last valid complete snapshot/version, last attempt/success, health and counts. Prefer one generation/timestamp per snapshot to rewriting unchanged movie records merely to bump lastChecked every day.
- Public active chain association is removed when absence is confirmed. Compact inactive listing observations can be purged after 30 days; retain only identity mapping and useful sourced date. Operational summaries expire after 30 days. Retention values are implementation defaults, not new user-visible features.

An active listing can be deleted without forgetting its source-to-TMDb mapping. Deleting both would save little but repeat matching work on every re-release.

## Date resolution and notification rules

- Keep TMDb's existing valid country-specific release information; add missing local evidence and expose provenance. Do not overwrite all dates simply because a scraper ran last.
- Prefer an agreed initial-theatrical date from independent chains when TMDb lacks RO data. A single clear source can supply a labelled provisional/listed date. When sources disagree, retain the differing observations, distinguish chain openings/reissues from national premiere, and avoid silently picking the earliest date.
- Keep the main user display to one resolved premiere date when supported. When a meaningful conflict cannot be resolved, say the date is uncertain rather than presenting a false precise national date.
- Original premiere, re-release and advance screening must remain distinct internally. Initial version need not add re-release notifications or force them into the original-release field.
- Existing release subscriptions and idempotent event keys remain intact. A source refresh, alternate-language version, chain reappearance or bulk backfill must not generate a second 'released' alert.
- Stage initial imports/baselines before enabling new-source alerts. Require fresh, sufficiently matched evidence; check user country/opt-out again before inserting an inbox event.
- Current popup delivery remains the existing app-sync/local-notification mechanism, not remote push while Nex is closed. TV reminders, series and digital alerts remain unchanged.

## Free-tier and latency strategy

- Start with ONE daily Ubuntu workflow at an off-hour minute. A central dataset is shared by all users. Public film catalogs do not require personal data or profiles to be sent to cinema sites.
- Four list requests form the base cycle, plus bounded detail/matching requests only for new/changed entries. Fetch chains in parallel, use low per-host concurrency, response-byte limits and timeouts, honour Retry-After, and stop on access denial instead of bypassing it.
- Set a worker runtime cap (initially 8 minutes) and a bounded enrichment budget with resumable pending matches. Bootstrap separately before exposing the feature; never make the first phone user wait for a cold import. Don't classify a partially processed bootstrap as a complete published catalog.
- Daily 2-5 minute runs would consume roughly 60-150 runner minutes per 30-day month. This is a planning estimate, not a benchmark. The list-only sample would total about 12.3 MB/month; details, matching, headers, retries and setup add overhead.
- GitHub standard runners are free for public repos; private GitHub Free currently includes 2,000 minutes/month shared with other workflows. EPG, release alerts and CI already consume allowance. Verify account/repo usage and enforce zero overage rather than assuming the whole allowance is available.
- GitHub schedule may be delayed/dropped and public-repo schedules can disable after 60 days without repository activity. Track source freshness and surface job failures; manual dispatch is recovery, not a phone-side scrape trigger. No exact-hour freshness promise.
- Vercel Hobby cron is an alternative daily scheduler but still invokes metered/limited Vercel Functions; it offers no clear advantage over the existing job infrastructure. Do not run both schedulers.
- Database indexed lookups and changed-row writes should be a small increment, but measure during the trial. No new monthly-cost promise beyond verified free quotas. No AI token usage for import/matching.
- Return a tiny summary with existing detail data, and request optional release sections independently of the first visible title/Home content. Cache shared public observations by data version. Never cache another user's follow/notification state in a shared response.

## Access conditions and support limitations

The user has selected Cinema City and Cineplexx as desired sources. Public endpoint availability is technically verified but does not grant a supported API contract or unrestricted reuse rights.

- Cinema City's website terms sections IV/V restrict content reproduction/distribution and ask for contact for additional uses. Its robots.txt does not disallow these film paths, but robots access is not a licence.
- Cineplexx's published website terms assert content rights and prohibit abusive use; they do not provide a documented third-party API/reuse licence. Its /robots.txt returned the application HTML shell, not a usable robots policy, in this check.
- Settle acceptable reuse before enabling an automated production import. No contacting providers, accepting terms, creating accounts, bypassing blocks, or paid services was done in this pass. If no suitable permission/arrangement is available, the technical design remains feasible but not production-ready.

## Implementation and verification sequence

1. Resolve source-use conditions. Implement pure adapters and normalized schemas from small permitted fixtures; keep the feature disabled by default. Test every edge case found above.
2. Add reversible migrations, source mappings and atomic snapshot reconciliation; dry-run first. No changes to user Taste or library data.
3. Trial live data over multiple schedule changes, explicitly checking nationwide scope, full-list coverage and current/future meaning. HTTP 200 is not a coverage test.
4. Add the shared release resolver and deterministic merged pagination; verify details, Upcoming, Chat and alert events agree for the same title/country.
5. Integrate compact chain labels into existing themed UI, empty-section hiding and loading behaviour. Ensure no new Home startup dependency, no blank cinema container and no confusion with streaming services.
6. Measure cold/warm details and upcoming pages before/after, counting upstream calls and database reads/writes. Phone refresh must issue zero cinema-source requests. Test bootstrap/worker downtime separately from app availability.
7. Test two-chain/one-chain/neither/reappearance; missing one language variant; future ticket sales; reissues; renamed movies; identical-title remakes; leap dates/DST; malformed/empty/partial/rate-limited feeds; concurrent runs; retries; stale suppression/recovery; mixed old/new source data; non-RO users; chat explicit-country requests; account deletion; opt-out races; no duplicate/backfill notifications; old-app API compatibility; pagination stability.
8. Run full backend and Flutter checks, then migrate/deploy with a feature flag and verified initial data. Rollback disables the supplement and restores TMDb-only behaviour without touching saved user data.

## Sources

- Cinema City public website and frontend-fed endpoints above: https://www.cinemacity.ro/
- Cinema City schedule publication: https://help.cinemacity.ro/ro/support/solutions/articles/103000376252-cand-va-ap%C4%83rea-programul-de-filme-pe-website-
- Cinema City website terms: https://www.cinemacity.ro/static/ro/ro/regulations-servicii-mijloace-electronice
- Cineplexx public website/frontend and endpoints above: https://cineplexx.ro/
- Cineplexx terms: https://app.cineplexx.ro/api/v1/media/files?path=Termen_si_conditii_site.pdf
- TMDb movie release types: https://developer.themoviedb.org/reference/movie-release-dates
- TMDb search and details: https://developer.themoviedb.org/docs/search-and-query-for-details
- GitHub schedules and failure conditions: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
- GitHub Actions free allowance: https://docs.github.com/en/billing/concepts/product-billing/github-actions
- Vercel cron limits: https://vercel.com/docs/cron-jobs/usage-and-pricing
- Turso published free plan: https://turso.tech/pricing (actual account usage not inspected)

Only this planning document was added during this research pass. Previously completed, uncommitted UI changes are preserved. No OpenAI calls or secret values were used by the public-source probes.
