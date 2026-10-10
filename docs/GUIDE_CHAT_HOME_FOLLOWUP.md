# Guide, Chat and Home follow-up

## Plan

1. Measure EPG coverage against the upstream feeds; select scheduled channels before applying the free-tier import budget, and hide empty channels in the requested guide window. Preserve country isolation, favourites and stable browsing order.
2. Strengthen preference routing without converting temporary requests, questions or library actions into permanent Taste. Improve concise conversational wording and readable, selectable Chat text.
3. Make Home refill allocation fair across short shelves, investigate real street-racing supply, and retain exact topic, service, history and negative-preference constraints. Never pad a narrow shelf with unrelated titles.
4. Add regression tests, exercise live integrations without mutating the user's profile, run checks, then publish and verify the backend. Provide a short phone checklist.

## Initial evidence

- Active Romanian directory: 358 channels; only 64 have future programmes in the database. The configured base import limit is 60 plus favourites.
- RO1 upstream: 356 scheduled channels, 30,394 future programmes. RO2: only 2 currently scheduled channels. Adding RO2 is not a general solution to the missing listings.
- Home refill picks the first three remaining sources repeatedly; later sparse shelves can be starved by the shared time budget.
- Chat's durable-preference gate uses a narrow English expression list. A failed gate eventually routes arbitrary text into catalog discovery.

## Research

- OpenAI prompt engineering: https://developers.openai.com/api/docs/guides/prompt-engineering. Keep instructions separate from untrusted conversation data; evaluate realistic follow-ups, not just isolated examples.
- GPT-5 minimal reasoning: https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_new_params_and_tools. Use minimal effort for the small routing/conversation task on the configured GPT-5 family, preserving the stronger configured model for verified Taste extraction and factual answers. No model or billing changes.

## Implemented

- Production Chat now uses structured AI routing with eight recent messages and active context. Preference, discovery, knowledge, TV, confirmed actions, ordinary conversation and unrelated requests have distinct paths. Word matching remains only in the no-key fixture fallback and in data/action validation, not as the production intent decision.
- Short replies to a Taste clarification retain the user's request and the clarification. A later request to save what was discussed can use recent user statements. Assistant suggestions never count as preference evidence.
- Regional exclusions can preserve international co-production exceptions through one scoped Taste combination. Existing ordinary dislikes are not rewritten into exclusions. Missing country metadata is not invented; exact title search remains accessible. No database migration is needed because existing evidence JSON stores the additional scope.
- Chat prose is selectable 16px text with comfortable line spacing, separate paragraphs and less enclosing chrome. Action confirmations remain distinct. Generated em dashes are removed, with citation positions adjusted.
- EPG selects non-stale, scheduled channels before its cap. The default and GitHub scheduled import budget expand from 60 to 120 plus existing favourites, not an unbounded global mirror. The guide excludes channels without programmes in the selected time window; their favourite records remain intact.
- Home refill runs fair rounds across sparse shelves instead of spending its whole optional budget on the first few sources. The same 24-page/12-second optional-fill bounds, exact topic checks and hard filters remain.

## Final verification (2026-10-10)

- Real Romanian sync: 12,533 rows imported. Channels with future listings increased from 64 to 126. RO1 provides more schedules than we import; this change does **not** claim full global channel coverage.
- Live OpenAI evaluation: 11 routing cases passed after correcting one capability-question misclassification. Multi-turn regional exclusion, co-production exception, Russia exception, contextual correction and casual conversation passed using synthetic users in an in-memory database. No real user Taste was changed.
- Home audit: 34 rows, 627 unique titles, 28 rows of 20. Short rows: bittersweet 16, street race 5, cerebral 18, car race 8, underdog 11, found family 9. All six batches obeyed current hard filters and cross-batch deduplication. Warm batch durations 3.286–4.827 seconds; first pass 6.615–8.356 seconds. These are local-backend measurements with live data, not physical-phone timings. No new embedding spend was allowed by the audit; valid existing vectors remained usable.
- Street-racing investigation: the direct movie source returned nine on the current services, four eligible under the account's current rules. Lowering the vote floor from 80 to 20 or zero did not add titles. Broader car-racing retrieval found 21 movies, but still only nine street-racing matches and four eligible movies. The mixed Home row found five items. These checks do not prove TMDB has no other untagged matches, and are not a reason to pad the shelf with unrelated racing content.
- Backend: 239 tests, typecheck, lint and build passed. Flutter: analyzer clean, 85 regular tests passed (17 opt-in tests skipped in that run), two Chat/Taste visual tests passed; natural text reviewed in both themes. Android debug build passed. Physical-device interaction remains for the user to verify.
- Secret scan: 1,133 files checked, no configured-secret matches. The deployment uploader independently checks its backend-only allowlist for configured secrets.
- GitHub EPG run [38045356735](https://github.com/12mihai05/Nex/actions/runs/38045356735) completed successfully for all nine countries. Current scheduled-channel counts: RO 126, BG 50, GB/ES/FR/CH/IT/DE 120 each, MD 6. Read-only database checks found zero foreign-key violations and zero programmes outside the configured seven-day-past/fourteen-day-future retention window. Older failed workflow runs remain historical.
- Application commit `00cb121` deployed successfully as `dpl_7woJPuMRD5aByi7zdYZ5KGd7a3JL`; Vercel confirmed the production aliases including `https://nex-three-omega.vercel.app`.
- Production guide/Chat smoke test passed: 126 Romanian channels with no empty programme lists in the requested window; multi-turn regional exclusion and co-production exception persisted to Taste; casual discussion returned text without em dashes; unrelated coding request stayed text-only; library remained unchanged. Request timings: preference clarification 13.423 seconds, casual discussion 2.194 seconds, unrelated request 1.957 seconds. These are observed requests, not latency guarantees.
- Production movie-example regression passed for Arrival, Contact and Prometheus, including mixed sentiment and grounded meanings without invented genre/director preferences or library changes. Anime exclusion stayed separate from animation, country and language dislikes.
- Production Home/Pick regression passed for New to me, Watch again and Either, Netflix-only availability, Seen + Like updates, and empty-provider validation. All three temporary production accounts were deleted; the Home/Pick test also verified session revocation.
- Live one-shot onboarding extraction retained mystery/gore preferences and returned no interactive clarification. Interactive Taste clarification is scoped to Chat. App-generated action confirmation/cancellation bypasses AI routing while retaining ownership, expiry and plan validation.

## Remaining limits

- Narrow Home rows are not guaranteed to contain 20 items. The audit above records the remaining short rows; expanding them with unrelated or explicitly excluded titles would be incorrect. Untagged upstream matches may still exist.
- The guide imports a bounded selection of scheduled channels, not every global channel. Empty channels are hidden for the requested window rather than given invented listings.
- Production tests cover representative conversations, not every possible model response. No claim of perfect intent classification is made.
- The real user's saved Taste and library were not modified. Repeat any desired exclusion in the updated app to save it with the new clarification behavior.

## Phone checks after updating

From `mobile`, fully stop the old run and start `flutter run --dart-define=API_BASE_URL=https://nex-three-omega.vercel.app`. Backend changes are already deployed; this run installs the updated Flutter UI on the connected phone.

1. Refresh TV, scroll well down the guide, search channels, and toggle favourites while scrolling. No empty channel rows should appear for the selected time window; favourites must not jump during that visit.
2. Repeat the Asian-content request with the Russia exception. Answer the co-production question, then inspect Your Taste. Expect a saved confirmation, not a recommendation carousel. Your real account has not been pre-edited for this test.
3. Talk about a filmmaking idea without asking for recommendations. Expect a readable conversational answer. Ask for a cake recipe or Python code; Nex should gently keep the conversation in its entertainment/app scope.
4. Check a normal recommendation, a factual title question, a TV follow-up and a watchlist/reminder proposal. Library/reminder changes must still require confirmation.
5. Refresh Home and scroll through every batch. Broad categories should fill; narrow categories can remain shorter when valid, unseen, available titles are scarce. Do not expect exactly 20 in every theme.
