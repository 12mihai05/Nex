# Home and Taste improvement pass

Scope: recommendation improvements 1–4, no new feedback controls or user-facing comparison feature. Preserve saved profiles, explicit exclusions, services, weak Seen/watchlist hints and temporary intent. No new provider or catalogue mirror.

## Delivery

- Opt-in progressive protocol: first three shelves (hero from first shelf), then six shelves per batch; retain legacy six-shelf paging for old clients. Stable plan and seen identities across requests, maximum seven batches for 36 definitions.
- Run discovery alongside startup reads after authenticated settings. Keep watchlist/history/ratings ready before publishing interactive cards. Load Taste and reminders independently; no library detail or TV fetch on Home startup.
- Compact Home wire cards, retaining identity, availability, synopsis and rendered fields; details still fetched by the existing detail screen. Keep recommendation evidence server-side.
- Preserve bounded provider concurrency. Overlap independent retrieval sources and settings reads. Move retention cleanup to existing scheduled maintenance, not untracked serverless tasks.

## Personalisation

- Bounded, deterministic interest-balanced selection of candidate seeds instead of always the same strongest few. No extra unbounded network fanout.
- Infer incidental traits conservatively from title ratings; require independent titles for strong confidence. Preserve direct statements and conditions. Recalculate on read from existing evidence, no destructive migration.
- Use existing multi-interest semantic groups, improve representative seed selection and relevance-constrained coverage. Do not average unrelated interests into one profile.
- Select/order shelves from diverse interests and actual match evidence, not quality/popularity alone. Preserve category membership, deduplication and filters.
- Retain a server configuration rollback for the recommendation enhancements.

## Verification

Backend tests: paging coverage, legacy compatibility, mixed interests, repetition/franchise evidence, explicit override, negative constraints, category ranking, compact payload. Flutter: parallel startup, supporting failures, no eager detail/TV calls, pagination retry/generation safety, filter scopes, all analyzers/tests. Benchmark real first/later requests with disposable account only; record limitations and delete account. Build Android and deploy only after checks pass.

References: Google recommendation architecture and re-ranking guidance; Flutter performance best practices. Research already reviewed in this conversation. Avoid claiming broader candidate retrieval necessarily improves subjective taste without evidence.

## Verified locally, 2026-10-14

- Backend: 303 tests in 37 files, typecheck, lint and production build passed. Flutter: analyzer clean, 103 tests passed, 20 opt-in visual/live checks skipped by the regular suite. Android debug APK built successfully.
- Real TMDB and embedding calls through authenticated Hono endpoints, with an isolated in-memory database: first three rows in 5.15 seconds / 57 KB; subsequent full six-row batches in 5.42, 6.95, 8.68 and 6.21 seconds / 110–120 KB. Final partial batch in 4.19 seconds. 596 distinct titles, no cross-batch repeats. All rows had 20 items except one found-family row with 16. Filters are not relaxed to fill a row.
- Legacy six-row client request and rejection of an invalid first-batch size passed. Test account deleted.
- Existing 24-persona semantic comparison rerun: every predefined preferred pair retained full credit. This used existing cached vectors (zero new model calls), so it is a semantic regression check, not fresh human preference evaluation or proof of improvement over the former balanced logic.
- Existing production baseline before this change: empty synthetic profile, first six-row startup 13.65 seconds, repeat 1.40 seconds; Home response roughly 210 KB. These are observations, not a statistically controlled benchmark or a guarantee for taste-rich profiles or phones.
- Existing evidence is recalculated without resetting ratings. Historical entries without a franchise group are not silently backfilled; new title evidence records the group. Direct statements retain priority. Rollback: RECOMMENDATION_PROFILE_VERSION=legacy (no data reset).
- No new provider, cache layer, model or paid infrastructure. Existing catalogue/vector caches remain. Official embedding guidance checked: https://developers.openai.com/api/docs/guides/embeddings
- Physical Samsung startup/scrolling and notifications require user testing. Backend timings exclude image rendering and phone network overhead.
