# Assistant v2 verification / continuation checkpoint

Updated 24 October 2026. **Local release candidate; not pushed/deployed.** No remote migration or real-account mutation. Preserve uncommitted source and the ignored spend ledger. Do not run paid harness processes concurrently.

## Latest: conversation compaction implementation

See CONVERSATION_MEMORY_IMPLEMENTATION.md. Migration 0015 is also required before deployment. Added rolling dated notes, read-only original-message/card recall, post-reply compaction, ownership isolation, expiring database leases, deletion/stale-writer protection, source-enum validation and failure backoff. Original transcripts and authoritative action/Taste state stay separate.

Latest backend regression: **400 tests / 43 files passed**, typecheck, ESLint and production build passed. 22 new memory tests. Live testing added 14 synthetic authenticated endpoint turns across iterations plus summary edge-case checks; see the memory document for failures found and fixes rather than assuming all intermediate outputs were correct.

Flutter regression rerun for this pass: analyzer clean, **123 passed / 20 existing skips**. No new phone/APK test.

Latest cumulative app-OpenAI ledger: measured **$6.38074796**, conservatively reserved **$6.76493546**, 697 requests. The original $7 ceiling remains; only about $0.235 remains under conservative accounting. Do not reset the ledger or run concurrent paid harnesses. This memory pass used approximately $0.432 measured. No more paid tests are needed for this pass.

## Constraints

Approved: implement and broadly test the researched assistant redesign. Application OpenAI testing capped at **$7 cumulative**, separate from Codex usage. Synthetic local users only; no printed secrets, new providers, Firebase or billing changes. No subagents used. Default CHAT_ASSISTANT_MODE=legacy intentionally leaves activation explicit.

## Implementation

See ASSISTANT_V2_IMPLEMENTATION.md for architecture and migration/activation/rollback. New files include assistant-loop.ts, assistant-tools.ts, assistant-resolver.ts, chat-request-repository.ts, conversation-memory.ts (domain/service/repository), migrations 0014/0015, evaluate-assistant.ts and Flutter chat_stream.dart.

Important fixes from live evaluation and inspection:

- Shared mutable fallback memory could contaminate synthetic conversations in a warm server. Fresh fallback state and cross-user tests fix this. Never deployed.
- Watchlist IDs supplied as keys were incorrectly removed as similarity seeds. Only catalog seeds are excluded now.
- Historical preference evidence could authorize a read-back question. Latest human turn now separately authorizes changes, while clarifications retain original evidence.
- TV/release adapters accept structured main-assistant plans, avoiding another intent parser. Verified local times prevent UTC/local confusion. Broad TV suggestions use all channels; explicit rolling-hour windows are supported.
- Echoed verified broadcast IDs no longer cause false movie-card verification errors. Unknown IDs still fail closed.
- Mixed/multiple carousels save one reference-position sequence, avoiding duplicate-position failures.
- News citation blocks render once and do not trigger unsolicited additional research after success.
- Real Dio byte-stream decoding, non-2xx errors, interrupted delivery, saved-reply recovery and mixed read/write text are covered.
- Concurrent request claims return a conflict rather than starting duplicate work. Same UUID replay is delivery idempotency, not AI-answer caching.
- Final answer IDs can receive one bounded, final-text-only correction against the verified eligible set. No tool or write is replayed, and server validation still rejects invalid IDs afterward.
- Read-only title resolution tolerates conservative transpositions and can retry a likely corrected spelling once when the provider returns nothing. Real remake ambiguity remains a question.
- Broadcast years survive TV follow-ups, preventing film/series name collisions from losing context. TV selection receives the actual local clock and server-verified window evidence rather than guessing the time.
- Single-title suitability was exercised with strong/weak matches, series, empty Taste, explicit ratings and clarification follow-ups. A real TMDb regional-year discrepancy (Lost in Translation: regional search 2004, canonical details 2003) is now checked against bounded canonical lookups; year constraints and remake safeguards remain intact.
- Same-title/same-year alternatives retain verified identities and brief descriptions, so a later cast/plot clarification can use title_details instead of starting another ambiguous lookup loop.
- Title details now include the authenticated user's actual rating, marked-Seen and watchlist status. This fixed a live failure where an ordinary personal-match question ignored a Dislike unless specifically told to check ratings. These records remain independent, refresh between turns and are covered by cross-user tests. A predicted match does not write Taste or library state.

## Automated verification

- Backend final full check: **378 tests / 42 files passed**, typecheck and ESLint clean.
- Production TypeScript build passed after the final source changes.
- Flutter analyzer at the preceding checkpoint: no issues. Full suite **123 passed, 20 skipped** (existing opt-in/platform/visual skips). No Flutter files changed in the subsequent suitability pass, so those platform checks were not repeated.
- Explicit light/dark visual suite: **2 passed**. Phase/progress screenshots inspected. These are widget renders, not Samsung screenshots.
- Android debug build passed against the configured production URL. This does not imply new backend deployment.
- Tests include auth, SSE/chunked UTF-8, idempotency, conflicts, user isolation, references, pagination, constraints, failures, cancellation, stale/replayed confirmations, Seen/rating independence and scoped Taste.
- Migrations exercised on local in-memory databases, not Turso production.
- Secret scan found no configured secret values in 491 nonignored files. .env, reports and generated outputs remain ignored. Whitespace checks passed; repeat after future edits.

## Live evaluation method

The opt-in runner uses real authenticated app.request('/api/chat') calls, synthetic Better Auth users, in-memory SQLite, real OpenAI/TMDb and controlled EPG fixtures. It cannot access the configured remote database. Assertions check selected IDs, source/non-repetition, reminders and stored-state mutations. Replies are manually inspected too: mechanical checks initially missed misleading prose next to a valid TV card.

Families cover watchlist selection; comparisons/misspellings; Wallflower feeling/more; persistent/temporary Taste; geographic exceptions; hypotheticals; unrelated/private-data requests; remakes/people; Romanian language; TV now/next/general/movie airings; reminders; confirmed/cancelled/replayed changes; mixed discussion+write; seasons/episodes; profile; releases; sourced news; empty/impossible requests.

Useful ignored reports in .tooling/assistant-eval:

- legacy-comparison.json: nine baseline turns. Legacy failed watchlist-only scope and named comparisons, but its feeling flow worked. Do not claim every old capability failed.
- tools-regression-final.json: 32-turn intermediate regression. Later clarification fixes supersede its extra-question behavior.
- tools-final-corrections.json: semantic watchlist, geographic exception and release fixes.
- tools-news-bounded.json: one sourced cancellation answer without extra research, about 36 seconds; unknown reasons distinguished from confirmed facts.
- tools-tv-direct.json: direct TV planning, comparisons and feeling journeys.
- tools-semantic-release-final.json: includes earlier failed watchlist behavior and an overly strict release assertion. Superseded; not an all-pass report.
- tools-tv-heldout.json: found missing rolling-window guidance and a fixture lacking the film's year. Corrected fixture; retained remake/year safeguards.
- tools-tv-heldout-fixed.json: mechanical checks passed but review found broadcast/movie ID confusion. Fixed with regression tests afterward.
- tools-acceptance.json: 51 turns across 17 families in semantic mode. Four assertions failed: the typo clarification, an invalid recommendation selection, a contaminated empty-library precondition, and film/series airing ambiguity. Preserve these failures as evidence; do not label this original report all-pass.
- tools-acceptance-corrections.json: 11 targeted turns. Multilingual non-repetition, genuinely empty/impossible libraries and title airings passed; one unnecessary spelling clarification remained and was subsequently corrected.
- tools-final-title-tv.json: final six-turn comparison/TV rerun, all checks passed. The exact “curela” spelling now resolves through a verified corrected lookup; TV next-three-hours, Moneyball airing and “what channel?” all passed with correct fixture evidence.
- tools-suitability.json / tools-suitability-edge.json: retained failures for the regional year mismatch, an ambiguity loop and a missing profile read. Manual review also caught wording incorrectly treating a rating as proof of viewing.
- tools-suitability-fixed.json / tools-suitability-edge-fixed.json: targeted four- and three-turn passing reruns before the final clarification-context improvements.
- tools-suitability-acceptance.json: eight passing turns covering Rocky, Lost in Translation, Ted Lasso, explicit prediction-vs-rating explanation, empty Taste, an existing Dislike and Arrival clarification. Personal judgments were reviewed against the synthetic profile, not claimed as objectively correct or calibrated probabilities.
- tools-suitability-rating-natural.json: one retained failure after removing the explicit instruction to check ratings. This exposed a real gap despite the preceding pass.
- tools-suitability-rating-fixed.json: final four-turn passing rerun with ordinary unprompted rating awareness, empty Taste and both turns of the Arrival clarification. The last follow-up used the retained verified identity directly. No Taste, rating, Seen or watchlist mutations occurred in these questions. Response length/paragraph density still varies and should be reviewed on the phone; these tests do not prove perfect phrasing or universal taste prediction.

This is engineering acceptance, not a blinded human study or a guarantee for every phrasing. The original aspirational 80 independent multi-turn scenarios are not all completed. The 51-turn semantic run had a 12.3-second median among turns using a provider, with a 31.7-second maximum; the separately checked sourced-news answer took about 36 seconds. These are small local samples, not production SLAs. No claim of universal speedup or scientifically proven recommendation quality. Recent model context is bounded (24 messages and up to 80 canonical identities); persisted history is not a promise that every old message is always in the model input.

## Remaining real-world verification

1. Apply additive migration 0014 to intended Turso **before** deploying the endpoint, even in legacy mode. Verify remote concurrent claims and deletion behavior; local SQLite does not prove remote behavior.
2. Check authenticated SSE and waitUntil persistence through Vercel, including disconnect/reconnect.
3. Test Samsung rendering/backgrounding and actual reminder notification scheduling. No physical device available this run.
4. Trial real-user Taste and production EPG coverage read-only; synthetic TV fixtures verify routing, not upstream completeness.
5. Request-response records are retained until chat clear/account deletion. Consider bounded operational retention if usage grows; never replay uncertain writes after pruning.

## Phone acceptance checklist after controlled deployment

1. Pick from watchlist, then others: only saved titles, no repeats. Add runtime limits and verify they persist.
2. Compare Moneyball / The Greatest Game Ever Played, then “those two plus Cruella”: retain named set, give an actual choice.
3. Discuss Wallflower, request its feeling, then others: preserve the emotional brief instead of generic profile favorites.
   Also ask whether a named film or series would suit your Taste and why. Check a title you disliked, an unrated title, and a clarification follow-up. Your rating must override a generic prediction without implying you watched it, and asking must not change Taste/Seen/watchlist.
4. State lasting dislikes/exceptions, answer clarification, ask what was saved and inspect Taste. “Tonight only” must stay temporary.
5. Synopsis plus watchlist addition: answer + preview, cancel once, confirm once; Seen remains independent of ratings.
6. Named channel now, what follows, 15-minute reminder: verify channel/time and actual phone notification.
7. Broad next-three-hours TV picks: no off-air recommendations. Named film airings: verified dates or honest missing evidence.
8. Season then episode-two follow-up; release/news dates, uncertainty and source links.
9. Disconnect midreply, reconnect, Check saved reply: no automatic resend/write. Restart app to verify history. Clear chat without clearing Taste.
10. Light/dark, large text, progress and loading states.

## Commands and budget

Backend: npm run check; npm run build.
Flutter: flutter analyze; flutter test.
Visual suite: NEX_VISUAL_QA=1, flutter test test/chat_visual_test.dart.

Paid opt-in example:
node --import tsx scripts/evaluate-assistant.ts --live --label=unique-label --case=watchlist,compare --engine=semantic --budget=1

Inspect spend.json first. Ledger accounts model/embedding tokens and observed web calls, conservatively reserving uncertain failures. Keep $7 ceiling. Do not reset or run concurrent paid processes.

## Final run totals

All evaluation processes finished. **240 recorded live endpoint turns in 31 reports**, including baseline/model experiments, failed iterations and reruns, not 240 independent scenarios. The latest suitability pass added 26 turns, including failures and corrections. Latest targeted reruns resolve the identified acceptance failures; no remaining failed automated regression is known. This is not one flawless 240-turn run.

Ledger: **$5.94859341 measured usage estimate; $6.33278091 conservative reserved total**, 633 provider requests, below the $7 cap. The difference reserves earlier uncertain calls, not additional proven charges. No further spending is required before the user's trial. Preserve the ledger and the remaining budget; do not reset it.

Local implementation and automated verification are complete enough for a controlled private deployment. Deployment remains unperformed: migration 0014, real Vercel streaming/remote database checks and the Samsung checklist are the next gates. Do not silently push/deploy or claim physical-device verification. No Taste/library reset is required. Keep the legacy rollback flag until the trial succeeds.
