# Seen library and independent opinions — September 27, 2026

## Approved behavior

Seen and opinion are independent. Missing history means viewing status unspecified, not known-unseen. Missing opinion means unrated, not Meh. The user explicitly approved a weak positive hint for unrated seen titles after discussing noisy implicit feedback.

- Seen/unrated: familiar title excluded from default new-title discovery; trusted genres/keywords can add one small, capped affinity nudge to other candidates.
- Like/Super Like: explicit positive evidence and recommendation seeds, with or without a seen mark.
- Dislike: excludes that title and supplies negative taste evidence, with or without a seen mark.
- Meh: explicit neutrality; clears that title's prior reaction inference and suppresses its seen-only hint. It is not a broad genre dislike.
- Any opinion replaces the same title's seen-only hint. Clearing the opinion restores a hint only when still seen. Undoing seen preserves the opinion.
- Ratings without history remain familiar, not falsely recorded as watched or claimed to be unwatched. Exact title lookup stays accessible.

The seen-only contribution is capped at 0.12 per candidate, not summed across a large library. A typical explicit genre Like contributes over ten times as much. Matching explicit negative taste suppresses the hint; behavioral personalization off disables it. This is an initial tuning heuristic, not a calibrated probability or proof of user enjoyment. [Implicit-feedback research](https://yifanhu.net/PUB/cf.pdf) supports the distinction between weak behavioral evidence and explicit preference, not this particular numeric weight.

## Implementation

Retained separate history and feedback tables. Added one additive migration, `0004_seen_trait_hints.sql`, storing compact trusted genre/keyword snapshots in history. Applied to real Turso without deleting existing rows. Historical rows lacking snapshots stay neutral until refreshed; no plot facts or preferences are invented.

Added authenticated feedback read/clear and history undo routes. Feedback/evidence changes are transactional. Clearing a rating removes its old inferred influence while preserving other titles and explicit preferences. Explicit ratings supersede weak watchlist inference from the same title. The weak seen hint remains separate from declared taste, so neither UI nor AI should call it an explicit Like.

Flutter now restores opinions after sign-in, retains all history snapshots rather than truncating the visible library at 30 hydrated items, and shows adjacent Seen/Like/Dislike/Meh/Super Like controls. A library search entry point and poster long-press editing are included. Undo seen and clear opinion are separate. Failed writes keep the previous state and show an error; controls disable while saving. Newly marked titles are retained in the local catalog. Metadata-only history cards load current details when opened.

Chat supports combined referenced statements such as “I watched the first one and liked it,” alongside seen-only, opinion-only, Meh and clearing. Recommendation requests mentioning watched history no longer automatically enter the mutation branch.

## Verification record

- Backend: 108 tests across 11 suites; typecheck/lint/build passed. Includes 160 reproducible mixed transitions, owner/media-type isolation, transaction rollback, opinion replacement, seen-hint removal/restoration, privacy-off behavior and a 1,000-entry history cap check.
- Flutter: 15 ordinary tests passed, with five opt-in tests skipped in that ordinary run. Analyzer clean. Includes all opinions independent of viewing state, large-text controls, 75-title restoration during metadata outage, and failed-write preservation.
- Three separate visual variants passed (23 captures each); changed detail/library/Browse screenshots inspected, including narrow large-text controls. Final Flutter web release build passed. These are renderer checks, not physical-device acceptance.
- Dependency production audit reports zero vulnerabilities; Drizzle schema/migration check passed.
- Final-policy Flutter HTTP rerun passed both tests against real Turso/Better Auth/TMDB/OpenAI, including restored seen/opinion state and independent clearing. A second final HTTP rerun after presentation/follow-up guards also passed both tests. The final secret-value scanner checked 225 source/generated text files with zero configured-secret matches; it does not prove the absence of every possible leak.
- Full 26-persona weak-seen rerun: 25 passed existing automated assertions, one failed (`competence_process`, `NO_CANDIDATES`). Four of those passes were explicitly permitted abstentions (concept intersection, unreliable perception, Japanese live action, revenge); the contradictory-runtime case correctly returned no titles. These are not 25 endorsements of subjective quality.
- Mixed seen/four-opinion/search/watchlist/Chat/clear/undo sequences passed for 25 personas in that run. The competence persona failed before reaching those steps, so a separate mixed-only run exercised them successfully. All 26 persona backgrounds therefore have passing mixed-state checks; the competence discovery failure remains open, not erased by the focused pass.
- The broader real-user journey suite passed all 15 groups earlier in this work, including authentication, authorization, settings, search, Chat actions and reminder lifecycle. It preceded the weak-seen adjustment; focused final-policy tests cover that adjustment.

Initial attempts encountered `429 credit_balance_exhausted`; the user restored application API credits. A subsequent direct structured-output check passed, and fresh-account reruns were started. Quota-affected runs are not counted as live-AI passes. The investigation followed [official API error guidance](https://developers.openai.com/api/docs/guides/error-codes); no billing settings or secrets were changed/exposed.

The outage exposed deterministic fallback gaps (negated concepts, language/genre confusion, intersection/runtime handling and unsafe guessed sentiment). Those were fixed and regression-tested. Free-text taste now explicitly reports fallback instead of guessing that a mentioned disliked topic is a positive preference. Explicit onboarding selections remain usable.

## Manual review findings beyond pass counts

- The competence request retained both `problem solving` and `teamwork`, runtime and owned-service constraints. A read-only real TMDB diagnostic returned no problem-solving keyword candidates and four teamwork candidates without evidence for the other concept. The intersection gate rejected them. Bounded keyword retrieval remains inadequate for some process/idea-led requests; no hard constraint was relaxed and no hand-picked movie was injected to pass the test.
- A passing comfort-to-mystery sequence retained stale cooking/friendship keywords. Added a regression assertion and a guard for explicit genre replacement with “instead”; retaining the same story concept is still supported. The focused live rerun passed, kept the 100-minute limit, cleared the old concepts, and selected *24 Hours with Gaspar* (98 minutes) instead of the previous *Scoob!* result. Its mixed-behavior sequence also passed. Its first reply used a labeled catalog fallback, so this is not claimed as an all-live-composition run.
- One Japanese-language response ended mid-sentence despite satisfying structured output's character limit. Added a complete-sentence/fallback guard and a passing focused real-AI rerun. This does not change ranking.
- No-gore/suitability prose sometimes omitted uncertainty. Added a deterministic content-guide caution for explicit suitability requests, including composition-failure fallback. Catalog tags cannot certify a lack of gore, disturbing endings or age suitability.
- Mixed ratings intentionally changed the personas: explicit likes on different titles legitimately introduced different genre/keyword evidence. The checks verify isolation, persistence, exclusions, runtime and mutation semantics, not that every resulting movie is personally enjoyable.
- Browse no longer takes its hero from the general catalog, which can contain restored history. It uses eligible recommendations; library restoration does not promote a seen/rated title as a new top pick. A 75-title metadata-outage test covers this.

## Limits

Synthetic tests establish mechanics and inspectable behavior, not “the best possible” recommendations. Metadata quality, bounded retrieval and model variability remain relevant. Honest abstention is different from breaking a hard constraint. Runtime assertions and output prose are checked separately from whether a human personally enjoys a title.

Evidence: ignored `.tooling/verification/personas-seen-weak-final-{0,1,2}.json`, `personas-seen-weak-competence-mixed.json`, `personas-intro-final.json`, and Flutter screenshots under `mobile/build/verification`. Earlier quota-affected and neutral-policy runs are retained separately and are not substituted for these results.

No deployment or mobile distribution was performed. Actual native notification delivery still requires a device/SDK. Credentials remain backend-only; test accounts are removed by each runner's cleanup.

Final post-run Turso audit: five migrations, zero foreign-key violations, zero EPG programmes outside retention and zero remaining synthetic verification accounts. Country data remains present for RO, BG, GB, ES, FR, CH, IT, DE and MD. The earlier neutral-policy 20-persona comparison also finished (19 assertion passes, the same competence retrieval failure) and removed its 20 accounts; it is not counted as weak-policy evidence.

After those checks, the requested EPG configuration review confirmed that country JSON entries are optional overrides and compared live RO1/RO2 feeds. RO1 was retained for materially better observed programme coverage; see [EPG_SOURCES.md](EPG_SOURCES.md). No local secrets were edited.
