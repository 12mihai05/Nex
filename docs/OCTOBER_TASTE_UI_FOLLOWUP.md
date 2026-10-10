# Interrupted-request checklist and verification — 10 October 2026

This continues the deployed TV scrolling, Android Back, Home error handling, anime preference routing and selectable-text fixes. No existing account was reset or rewritten.

## Implemented in this follow-up

- Centered dialogs share Nex styling, spacing, rounded shape, icon treatment and wrapping actions. Bottom sheets and full-screen editors retain their structure. Tested at normal and double text scale.
- Light mode uses a darker warm-neutral background, distinct lighter cards, stronger outlines, deeper burgundy and readable secondary text. Dark palette values are unchanged. Contrast tests include primary-on-surface and text on container surfaces.
- Chat extracts named movie/series examples alongside explicitly stated story preferences. TMDB verifies identities and descriptions before saving. Ambiguous matches require clarification; explicit directors can resolve same-year duplicates. Provider failures or unresolved examples do not produce a false success or partially save the other preferences in that message.
- Examples live in the existing Taste evidence JSON, with a canonical TMDB reference and a verified premise. No migration, second profile, implicit rating, Seen or watchlist mutation. Repeated identical evidence replaces rather than accumulates. Editing preserves the reference; deleting the Taste entry removes its influence.
- Positive examples supplement candidate retrieval (at most two related-title sources per request); their premises use the existing semantic ranking path. Negative examples remain signed, bounded story hints, not bans on the whole genre/country. Explicit reasons can refine these broad examples. They do not prove why someone liked a title.
- Persistent Taste extraction uses configured `OPENAI_CHAT_MODEL`, falling back to `OPENAI_MODEL` if absent. Live tests found the lighter model inconsistently omitted short named-title preferences. No model key or billing setup changed.
- Approved matching fix: a scoped single trait requires both the base trait AND its conditions. A combination is defined by all its conditions. Previously, a country preference scoped to movie/series could match every movie/series and penalize unrelated countries.
- Legacy China/Japan/Korea/France spellings are interpreted as their country codes at matching time, without rewriting saved evidence. Equivalent aliases do not double-count same-polarity evidence. Kpop/K-pop spelling is normalized. Ordinary dislikes are still soft penalties; explicit supported keyword exclusions remain separate.

## Investigation: later Home batches

All six batches were audited against the account's current saved state without changing ratings, history, Taste or recommendation impressions. The pre-fix inspection found unrelated US titles penalized for China/Japan/Korea. The fix removes this incorrect match.

Post-fix deterministic ranking audit (not a semantic-quality benchmark):

- Batch 0: 103 titles; row sizes 20, 20, 20, 7, 20, 16; 13.45 seconds.
- Batch 1: 117 titles; row sizes 20, 20, 20, 20, 17, 20; 10.09 seconds.
- Batch 2: 120 titles; six rows of 20; 8.38 seconds.
- Batch 3: 109 titles; row sizes 10, 19, 20, 20, 20, 20; 11.51 seconds.
- Batch 4: 110 titles; row sizes 10, 20, 20, 20, 20, 20; 7.65 seconds.
- Batch 5: 120 titles; six rows of 20; 10.09 seconds.

Across 679 delivered titles: zero cross-batch duplicates and zero country penalties unsupported by the title's country metadata. All batches use the same ranking function. These are live-source elapsed times, not a controlled before/after speed comparison.

Some disliked content may still appear because ordinary dislikes are soft signals, metadata can be incomplete, and preferences can compete. A broad legacy `country: asia` is not silently expanded into a guessed set of countries. The earlier semantic audit fell back to baseline because the account's daily semantic budget was exhausted. This follow-up does not remove budget safeguards or claim semantic ranking ran when it did not.

## Investigation: short racing row

The narrow `car race` discovery query returned 17 raw titles under the account's Romanian services, before history exclusions and cross-row deduplication. Additional related tags found some other titles, but broader motor-sport tags also included motorcycle content. This does not establish that TMDB has no more relevant films. No unrelated filler was added, and 20 items in every category is not guaranteed. The retrieval time budget, provider availability, eligibility and deduplication can leave shorter rows. The existing refill regression still verifies 12–19 items are filled to 20 when a subsequent page contains enough eligible titles.

## Verification and limitations

- Backend: 222 tests passed, typecheck and lint passed; production TypeScript build passed.
- Flutter: 85 tests passed, 17 opt-in tests skipped in the normal suite; analyzer clean.
- Separate visual run: 11 tests passed, including major screens in light/dark and narrow large-text layouts, filter controls and centered dialogs. Rendered screenshots inspected for profile, filters and large-text dialog. Contrast failures discovered during development were fixed and rerun.
- Android debug APK built successfully. Native Samsung Back gestures are covered by Flutter navigation tests but were not manually exercised on the physical phone in this pass.
- Real OpenAI and TMDB checks exercised mixed positive/negative examples, generic anime preferences, ambiguity, and verified director disambiguation. Early failures were caught before deployment. Semantic example persistence/ranking and idempotence tested with a local migrated database and deterministic model, not claimed as a live subjective-quality evaluation.
- `scripts/verify-chat-examples.ts` provides a production HTTP verification with a disposable account and cleanup. It checks persisted canonical examples, sentiment, no unsolicited library changes and the anime correction.
- Secrets scan found no secret-bearing files. Credentials stay server-side and are never logged by verification scripts.

## Deployment verification

- Application revision `5178d56` deployed successfully to the production Vercel aliases, including `https://nex-three-omega.vercel.app`.
- Production HTTP test passed: Arrival (329865), Contact (686) and Prometheus (70981) persisted as verified examples with the intended mixed sentiment. No actor/director/genre/country preferences were invented from those examples; Seen, ratings and watchlist stayed empty.
- Production anime correction passed without adding a broad Animation, country or language dislike. Synthetic verification account deleted successfully.
- Flutter-to-production tests: both passed (authentication/API operations and real Browse rendering). Their separate synthetic account was also deleted successfully.
- Final Android debug build and analyzer passed after the final contrast adjustment.
- GitHub's scheduled EPG workflow is a separate unresolved configuration issue: the latest inspected run failed for all nine countries with generic `SYNC_FAILED` codes. Repository secret metadata shows the required Turso URL/token and optional TMDB token are absent. No secret values were read from GitHub or printed. Permission to provision encrypted repository secrets was requested separately; this is not a backend deployment failure.

## Approved EPG secret setup and live test — later on 10 October

- With explicit user approval, configured `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` and `TMDB_READ_ACCESS_TOKEN` as encrypted GitHub repository secrets. Values were taken from local configuration, encrypted with the repository public key, and never printed, written into source, or committed.
- Dispatched [EPG workflow run 38036931003](https://github.com/12mihai05/Nex/actions/runs/38036931003), then retried its failed job once. Both attempts successfully synced RO, BG, GB, ES, FR, IT, DE and MD. CH failed with the generic `SYNC_FAILED` code, so the overall GitHub result remains failure. Missing credentials are resolved, but the scheduled job is not fully healthy.
- Switzerland's public provider loaded successfully in a read-only local check. A subsequent full local sync against the same Turso database succeeded with 7,179 imported entries. This restored a fresh Swiss schedule without changing the provider configuration or application code; it does not establish the cause of the GitHub-only failure.
- Verified all nine countries have current/upcoming programmes. Retention checks found no programmes outside seven past days / fourteen future days. A failed sync preserved the previous Swiss schedule.
- A follow-up investigation needs safer, more specific runner error diagnostics for Switzerland; two failed runner attempts plus a successful local sync are not evidence of a permanent repair.

OpenAI Docs informed the structured-output implementation: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). Schema conformance is not semantic verification; title resolution and persistence checks are performed separately.

## Superseding reliability pass

The remaining-work pass is recorded in [RELIABILITY_VERIFICATION_2026_10_10.md](RELIABILITY_VERIFICATION_2026_10_10.md). It supersedes the unresolved EPG status above: full GitHub workflow `38040947066` passed for all nine countries after atomic snapshot uploads and bounded transient retry support. It also covers the Home CPU/cache fixes, semantic quota fallback, additional narrow-topic retrieval, live production checks and honest remaining limits. Physical Samsung checks are delegated to the user at their request in [PHONE_TEST_CHECKLIST.md](PHONE_TEST_CHECKLIST.md).
