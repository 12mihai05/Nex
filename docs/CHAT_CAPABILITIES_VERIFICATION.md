# Chat capability verification — 2026-10-14

## Implemented

- Model-planned compound requests reuse existing handlers. At most four tasks and one write proposal per message; dependent tasks stop if their required identity is unresolved. Compound decomposition uses the existing configured chat model; ordinary routing retains the lightweight model.
- Release questions use existing country-specific TMDB readers and cited OpenAI web search for announcements. Upcoming pagination retains country/date scope, buffers undisplayed items, and avoids repeated IDs.
- Channel identity can use cited web sources; usual programming is explicitly a limited retained EPG sample. Channel follow-ups retain verified identities/country. “Now” is resolved by the server, not a rounded model-generated clock minute.
- Recommendation explanations read the user's recorded ranking evidence. Missing evidence is disclosed rather than invented. TV recommendation continuation excludes repeat titles as well as broadcast IDs.
- Taste corrections/removals have exact previews, expiring confirmation IDs, transactional snapshot checks, cancellation and replay protection. Ratings, Seen and watchlist are not erased. Batch deletion avoids a database round trip per target.
- Newly named subjects take precedence over incidental pronouns referring to older cards. Existing episode references still avoid unnecessary title lookup.
- Saved reminder lists render exact stored channel/date/advance-minute facts without another generative answer. Phone scheduling is not claimed as verified by the backend.
- Help copy reflects the implemented capabilities. No new third-party provider, Firebase, infrastructure service or schema migration.

## Verification completed locally

- Backend: typecheck, lint, regression tests in 36 files, deployable build (final count recorded with production verification below).
- Flutter: analyzer clean; 102 tests passed, 20 opt-in tests skipped; Android debug APK built against the production API URL.
- `backend/scripts/verify-chat-capabilities.ts all`: complete 26-turn run passed through real authentication and the same Hono API endpoints as the app, using an isolated in-memory database. Live OpenAI and TMDB were enabled and exercised; TV programmes were explicitly synthetic. No production user profile was read or changed. Disposable account deleted.
- Read actual responses, not merely HTTP status. Covered learning/reading/removing Taste with confirmation; channel summary/current/next; compound TV plus settings; upcoming plus more; sourced season announcement; Wallflower feeling recommendations plus explanation and different follow-up titles; multi-title watchlist; Seen without rating; 15-minute reminder and reading it back; out-of-scope coding request.
- Additional regressions cover stale/expired/cross-user/replayed confirmations, unchanged unrelated preferences, conditional replacement, source-page gaps, no repeated broadcast titles, foreign-country follow-up, missing explanation evidence, named-subject precedence and dependent-write suppression.

## Failures found during testing and corrected

- Conflicting legacy router instructions sent saved Taste removal to preference extraction or release follow-ups to ordinary discovery. Removed the conflicts and scoped discovery instructions to discovery only.
- The compound planner sometimes copied the whole question to every handler. Isolated single-task instructions, complete handler definitions and the configured chat model corrected the tested cases.
- Provider pages larger than the chat carousel lost unseen titles. A continuation buffer now preserves the remainder.
- Country-local release dates were not safely globally ordered by provider primary dates. An out-of-range page no longer terminates the scan prematurely.
- A supplied rounded current clock minute could select the previous programme near a boundary. The server now retains exact “now” semantics.
- A reminder-read answer once contradicted the stored reminder. Factual reminder list rendering removes that additional generative step.
- First deployment verification exposed another compound-TV failure. Specialist history is now scoped to its delegated task without rewriting the stored conversation; duplicate task requests are rejected. TV pagination is explicitly separate from contextual follow-up, so repeating a factual “now” lookup does not suppress an already shown programme.
- Fixed one grammatical ranking-evidence label and reduced unnecessary technical wording in personal summaries.

## Limits and remaining physical checks

- No finite test set proves every possible natural-language request. AI interpretation remains fallible; source availability and ambiguous identities can still require clarification.
- TMDB contains two movies named Arrival from 2016. The tested bulk request correctly refused partial changes until the precise identity was provided. This remains a more technical clarification than ideal; detail-screen actions are an alternative.
- Local complete-run discovery took about 40 seconds per fresh recommendation request in the taste-bearing test account; other runs were about 17–20 seconds. No claim of universal latency improvement. Compound reads were about 12–14 seconds; simple TV follow-ups about 4–6 seconds. Network/model variation and cold data affect these observations.
- Taste edit previews are bounded to 30 targets and 500 candidate preferences; larger edits direct the user to Profile rather than silently truncating. This does not cap profile storage or the existing paged Taste UI.
- Release listings only include dates supplied by the catalog. No claim of complete cinema coverage or a local streaming date inferred from a season's original premiere.
- Physical Samsung notification delivery, permissions, UI appearance and the complete mobile network journey were not exercised in this run. Backend reminder persistence and action payloads were tested; the phone still needs a real notification check.
- Production deployment verification is recorded below after the deployment completes.

## Production follow-up, 2026-10-14

Commit 21d9ce5 is deployed READY. The remaining compound coordinator issue was a successful settings read being treated as unresolved because it returned no entity card. Internal verified-read status now allows dependent reads to proceed; it is not exposed publicly and does not authorize dependent writes without a resolved entity. Regression tests cover both cases.

`verify-chat-capabilities-deployment.ts` passed against the production alias: Taste preview/commit, compound Antena 1 plus selected country, channel programming follow-up, dated upcoming releases and non-repeating continuation. The disposable account was deleted and its session was confirmed revoked. No real user's account or chat was accessed. Compound read took 18.9 seconds; channel knowledge 14.9 seconds; upcoming requests 3.8–4.3 seconds. This does not verify physical-device notifications or every possible AI phrase.
