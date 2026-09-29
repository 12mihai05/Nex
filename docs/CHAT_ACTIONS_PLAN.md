# Explicit Chat actions

- Parse a bounded action proposal, never execute model output directly. Use the configured
  Chat model for mixed title lists; preserve separate watchlist, Seen and opinion fields.
- Resolve named titles through TMDB and displayed references through the current user's
  current conversation. Ambiguous/missing entries block the entire proposal; no silent skips.
- Show every resolved title, year/type and requested change before confirmation. Maximum
  50 entries per request; reject oversized or truncated output rather than dropping entries.
- Persist an expiring, user/session-scoped proposal. Confirm/cancel are deterministic.
  Apply library writes, taste updates and the completion receipt in one transaction so
  duplicate confirmations cannot duplicate events or leave a half-applied list.
- Resolve reminders against active country/channel EPG entries and exact local dates;
  show actual channel/start time/offset before confirmation and recheck at commit.
  Keep device-notification acknowledgement separate from server persistence.
- Test authorization, ambiguity, mixed actions, negatives, retries, rollback, large batches,
  EPG times and real OpenAI parsing. Do not promise perfect natural-language interpretation.

## User behavior and limits

- Requests are proposals, not immediate writes. Confirm changes applies the full list;
  Cancel changes discards it. Proposals expire after 15 minutes.
- A list can combine Want to see, Seen and like/super like/dislike/meh independently.
  Clearing an opinion does not remove Seen. Numerical/star ratings are not silently mapped.
- Prefer one title per line, with year and movie/series. Explicit “One title per line:”
  inventories receive an independent coverage check in addition to the model count.
- TMDB genuinely contains same-title, same-year movies (for example Arrival, 2016).
  Ambiguities show exact identifiers. A user-supplied “movie, TMDB ID 329865” can resolve
  the item, but the server still verifies its title/year. IDs invented by the model are rejected.
- A TV request needs programme, channel, day and advance minutes, or an explicit displayed
  programme reference. Exact times take precedence; approximate times allow a one-hour
  lookup window only when unambiguous. Actual EPG start is displayed before confirmation.
- No matches, multiple matches, unavailable AI, or failed catalog lookups do not create a
  partial proposal. Reminders may use non-favorite channels in the selected/explicit country.
- A server reminder is not proof of a phone notification. Flutter schedules locally and
  acknowledges separately. Delivery still depends on OS permissions/settings and EPG accuracy.
- No extra paid infrastructure or schema migration. The existing conversation context stores
  bounded proposals and receipts. Full 50-title imports can take tens of seconds; the UI waits
  and prevents duplicate sends. Server confirmation does not consume another AI quota unit.
- Not supported here: mixed library-plus-reminder batches, arbitrary numeric ratings, fuzzy
  translated programme matching, or unspecified franchise expansion. These require clarification.

## Reproducible checks

- `npm run check --workspace backend`
- `npx tsx backend/scripts/verify-chat-action-ai.ts`: live structured interpretation, including 50 entries.
- `npx tsx backend/scripts/verify-chat-bulk-database.ts`: real Turso atomic 50-title synthetic batch;
  creates/deletes a disposable private account. This tests persistence, not catalog matching.
- `npx tsx backend/scripts/verify-chat-actions-deployment.ts`: deployed authentication, real
  OpenAI/TMDB proposal, confirmation/replay, field clearing, cancellation and current EPG reminder.
- `flutter test test/chat_actions_test.dart`: visible confirmation label, exact identifier sent,
  and refreshed library/ratings through a mocked API. This is not a real-phone notification test.

## Verification — 2026-09-29

- Backend typecheck, lint and 158 tests passed; backend build passed.
- Flutter analysis and 63 tests passed; 12 opt-in visual tests were skipped. Debug Android build passed.
- Seven live OpenAI cases passed after hardening: explicit catalog ID, mixed independent flags,
  negation, recommendation-only narrative, approximate ProTV time, unsupported numeric ratings,
  and a 50-line import with every title accounted for. The first 50-item attempt failed;
  bounding the parser to one 65-second attempt passed subsequent runs (25–32 seconds).
- Real Turso transaction with 50 synthetic titles passed: 50 watchlist, 50 Seen, 50 ratings,
  with safe replay. The commit/read/replay test took 36.8 seconds from this PC. This is not
  a 50-real-title end-to-end catalog benchmark and is not instantaneous.
- Deployed real authentication/OpenAI/TMDB/Turso flow passed with four mixed titles, unchanged
  state before confirmation, confirmation, retry, clearing only a rating and cancellation.
  An initial Arrival request was correctly rejected because two 2016 movies share its title;
  supplying the verified catalog ID resolved it without popularity-based guessing.
- Live Romanian EPG reminder passed for The Triplets on Jimjam, with exact EPG start and
  15-minute offset; deletion followed by stale confirmation did not recreate it. An earlier
  live EPG proposal was declined before saving; its precise reason was not captured by that
  run's diagnostic categories. The subsequent reminder-only and full journeys passed.
- All disposable accounts were deleted. Credential scan found no configured-secret matches.
- Backend-only deployment dpl_HMZi8LTVEZANWEV3j49q8vittiwS is READY on both existing domains.
  This direct deployment preceded the follow-up source commit. This verification does
  not establish the status of the earlier CI failure.
- Still unverified here: actual OS notification delivery from this new Chat flow, iOS device
  behavior, and perfect recognition of arbitrary wording or missing/incorrect upstream EPG.
  No 100% natural-language or broadcast-data accuracy guarantee is made.

## Chat usability follow-up — 2026-09-29

- Explicit channel/date/numeric-clock TV questions use a deterministic, country-scoped
  EPG lookup before recommendation parsing. Channel filtering happens before pagination;
  an 8pm query includes a programme already running at 8pm, not only starts at 8pm.
  Unrecognized channels, ambiguous clocks and unsupported date/time expressions ask for
  clarification instead of returning an unrelated schedule. Today/tomorrow/ISO dates and
  numeric 12/24-hour times are supported. This is not unrestricted natural-language scheduling.
- Capability questions about updating taste receive an accurate non-mutating explanation.
  Lasting “I like…” preferences are recognized; tonight-only wishes remain temporary.
- Library proposals/receipts include bounded structured artwork/title/year/change rows.
  Older clients retain the text fallback; new clients show cards without duplicate text.
  The existing explicit confirmation and atomic writes are unchanged.
- Chat now includes a help icon explaining discovery, lasting taste, library actions,
  TV schedules, reminders, limits and device notification permissions. Response-language
  selection was intentionally left unchanged.
- 164 backend tests and 68 Flutter tests passed, plus two opt-in light/dark Chat visual
  renders inspected manually. Analysis/typecheck/lint and Android/backend builds passed.
- Live deployed journey passed: capability question makes no taste writes; ProTV at
  20:00 returns only an overlapping PRO TV programme (~2.1 seconds in this run); a
  lasting statement saves positive underdog and negative gore evidence; real movie
  proposals carry poster URLs and per-item changes; confirmation/replay/clear/cancel and
  an EPG reminder remain functional. Disposable test account deleted afterward.
- Latest backend deployment: dpl_8Eqv34ERxanGVQaviq6guY9whUch. Phone rendering and actual
  notification delivery were not re-tested in this follow-up. This direct deployment
  preceded the follow-up source commit.
