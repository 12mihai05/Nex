# Remaining-work verification — 10 October 2026

## Delivered

- Public TMDB cache: bounded LRU (1,024 entries / 8 MiB / maximum one-minute worker lifetime), country-keyed availability, combined metadata/availability writes, no redundant raw title-detail payload persistence. Provider cache TTLs remain enforced.
- Ranking: request-local score reuse, weakly owned metadata/text matching caches with mutation invalidation, and incremental diversity selection. No preference weights changed. A slow reference algorithm test confirms the same ordering, ties, collection behavior and semantic adjustments.
- Home: case-insensitive genre-row deduplication; conservative car-racing synonyms and one-directional subtype retrieval; additional bounded lower-vote retrieval for narrow concepts. A Formula One or street-racing preference remains distinct from a broad car-racing preference. Final topic, service, history, explicit exclusion and runtime checks still apply. Lower-vote candidates retain Bayesian quality shrinkage, not inflated confidence.
- Semantics: quota denial prevents new paid calls, not reuse of existing title vectors and the exact current private profile. Missing title vectors remain baseline-scored. Missing/changed private profiles are not silently replaced with stale preferences. Quota checks are performed at most once per preparation; private-profile validation precedes expensive public vector reads.
- EPG: country snapshot changes are one atomic database batch rather than hundreds of network-held transaction steps. Safe stage/code diagnostics replace opaque failures. Whole-snapshot transient failures receive at most three attempts with bounded backoff; constraint/data failures are not retried. Upserts use the same timestamp, so a lost commit acknowledgement can be retried safely. Retention and rollback of the previous valid schedule are preserved.
- GitHub: added an optional country input for targeted recovery; the daily nine-country schedule remains unchanged. No paid infrastructure or provider was added.

## Findings and measurements

The Switzerland failures were narrowed to the snapshot/database upload stage, including a `FETCH_FAILED` network failure. Local success was not accepted as proof of runner health. Targeted runner checks and the final full-country workflow passed after the reliability changes. The evidence does not identify the underlying network operator or prove that external services will never fail again.

The CPU profile showed repeated concept/text matching as the dominant Home CPU cost. A warm first-batch measurement had about 15 seconds of work despite only one short database request and no TMDB request; geography alone did not explain it.

With the same saved account profile, a final two-pass six-batch audit found:

- First pass: 14.260, 3.203, 6.117, 4.485, 5.563, 2.961 seconds.
- Warm pass: 3.230, 1.973, 2.733, 2.315, 2.940, 2.423 seconds.
- Earlier pre-CPU-optimization warm pass: 18.727, 18.280, 20.509, 15.980, 19.820, 12.093 seconds.
- Final warm result: 34 rows, 649 unique titles, 29 rows with 20 cards. The five shorter rows had 16, 19, 14, 11 and 9 cards. Racing reached 14 in this allocation.
- No cross-batch duplicates or hard-filter violations detected.

These are local backend-service timings against real TMDB/Turso, not Samsung render timings or a controlled cold-catalog benchmark. Requests and cache warmth vary; the first cold batch can still be slow. The audit deliberately denied new semantic spending to test the budget boundary. It is not proof of subjective recommendation quality or of every possible title being searched.

Twenty remains a target, not an excuse to use irrelevant filler. Narrow themes, metadata coverage, regional subscriptions, history and global deduplication can leave fewer valid retrieved candidates. Bounded retrieval is not an exhaustive TMDB catalogue search.

## Verification

- Backend: 231 tests across 31 files; typecheck, lint and production build passed.
- Flutter: analyzer clean; 85 ordinary tests passed. Opt-in live/visual checks are tracked separately, not counted as ordinary-suite passes.
- Live embedding check: two requests, 116 input tokens, no AI review calls. Cached scores remained unchanged within numerical precision when a new uncached candidate was added after quota denial; no further paid call was made.
- Production Home/Pick user journey: service and watch-status filters, Seen+Like behavior, invalid empty-service validation, account deletion and session revocation passed.
- Production Chat: mixed positive/negative canonical movie examples persisted with grounded meanings; no unsolicited ratings/history/watchlist writes. Anime correction passed without banning Animation or a country/language. Temporary account deleted.
- Production TV: favorite changes preserve the current guide ordering when the browsing-session override is supplied. A custom 17-minute reminder was created and read back, another account could not delete it (404), and owner cancellation succeeded. Both temporary accounts were deleted.
- Flutter-to-production: both HTTP/authentication and real Browse rendering tests passed; temporary account deleted.
- All 15 opt-in visual tests passed: main screens in dark/light/narrow-large variants plus Chat/help, filters, loaders, title extras and Pick. Reviewed rendered Home, TV, Taste, Chat help, filters and series extras images. Android debug APK build passed.
- Final source secret scan: 1,115 files inspected, zero configured-secret matches. No secret values were printed or committed.
- Live database: zero foreign-key violations and zero EPG programmes outside the configured 7-day past / 14-day future window. All nine countries have current/upcoming data.
- Physical Samsung gestures, notifications, trailer apps and device performance were not exercised: no device was connected, and the user elected to perform these checks personally. See the phone checklist.

## Deployment and GitHub

The main improvements at `46f8ba2d2385ea5caf1ec4aa6a4936213c34fede` passed the production user journeys above. Final review separated narrow racing subtypes from broad discovery synonyms, with regression coverage. Final application commit `b51fe3fde5f33b0333eda5e48d3c5886243bf032` is deployed READY as `dpl_3s9NgGC6LLfe5M4oq2woGEUq8XiG`. Both `https://nex-three-omega.vercel.app` and `https://nex-mihai19.vercel.app` were verified aliases of it. Backend only; mobile continues through `flutter run`.

[Full EPG workflow 38040947066](https://github.com/12mihai05/Nex/actions/runs/38040947066) succeeded for RO, BG, GB, ES, FR, CH, IT, DE and MD. Imported/upserted rows respectively: 6,840; 3,098; 5,654; 5,568; 5,836; 7,179; 8,878; 5,492; 1,013. Historical red workflow runs remain as history; they were not deleted or misrepresented as successful.

## Research informing the changes

- [Turso batching guidance](https://turso.tech/blog/batches-in-sqlite-838e0961) and [libSQL batch atomicity](https://tursodatabase.github.io/libsql-client-ts/interfaces/Client.html): reduce transaction round trips without sacrificing all-or-nothing snapshots.
- [TMDB Discover](https://developer.themoviedb.org/reference/discover-movie): use verified keyword alternatives and regional provider filters; local eligibility remains authoritative.
- [OpenAI latency guidance](https://developers.openai.com/api/docs/guides/latency-optimization), consulted through the OpenAI Docs skill: reuse work and avoid unnecessary requests. Durable embedding reuse is Nex's application cache, not OpenAI prompt caching.
- [Flutter integration testing](https://docs.flutter.dev/testing/integration-tests): automated widget/build checks do not substitute for physical-device acceptance.
- [GitHub logging guidance](https://docs.github.com/en/actions/how-tos/monitor-workflows/enable-debug-logging): targeted diagnostics were preferred to dumping SQL/provider errors that could contain sensitive data.
