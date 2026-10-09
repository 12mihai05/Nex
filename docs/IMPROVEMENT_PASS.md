# Nex improvement pass

## Scope and sequence

1. Baseline existing production endpoints and deterministic persona tests; no private user transcripts in logs.
2. Extend existing displayed references/session context with canonical typed entities. Resolve identities before actions; clarify ambiguity; retain confirmation and ownership checks.
3. Preserve compound taste constraints instead of flattening them. Distinguish durable declarations, temporary wishes and uncertain comments. Reuse the existing evidence store/ranker for Home, Chat and Pick.
4. Improve candidate breadth, shelf-specific retrieval, cross-batch duplicate control and bounded diversity. Prefer fewer strong results over filler.
5. Improve title search using TMDB's alias-aware search, conservative local relevance and bounded fallback. Reduce hydration and redundant cache/database work.
6. Build the unified, paged timeline TV guide on existing EPG/channel favorites/reminders. Virtualize rows; bound each fetched time window.
7. Make Taste an understandable control surface (summary, groups, search, polarity, recent/strong preferences, corrections/removal), not an unbounded raw list.
8. Route entertainment knowledge through TMDB/EPG first; current/explanatory gaps through grounded, cited OpenAI web search. No new paid provider or secret in Flutter.
9. Replace full-screen preparation cards with a minimal N animation, respecting reduced motion. Keep content skeletons where appropriate.
10. Full regression suites, adversarial persona/context cases, live integration/latency comparisons, visual review, backend-only deployment and explicit limitations.

## Architecture constraints

- Extend `conversation_displayed_items` and `session_context`, not a parallel vector memory or transcript-only prompt.
- Canonical TMDB media/person identifiers; EPG broadcast IDs retain channel/time/country/source and optional matched TMDB IDs. Never derive IDs from model memory.
- Existing taste evidence remains authoritative. Composite preferences must match all their components; dislike of Asian romance is not dislike of all Asian content or all romance.
- Retrieval, scoring, diversity and explanation remain distinct. Exact lookup remains independent of personal dislikes.
- No model call on normal search or EPG guide scrolling. Public metadata caches never contain private user state; cache lifetime/invalidation explicit.
- No external writes/actions from web content; citations are validated HTTPS links. No claims of real-time availability from model knowledge.
- Every private mutation uses authenticated identity. Clear-chat removes entity context too; saved taste/library/reminders remain independent.

## Research notes

- [TMDB finding data](https://developer.themoviedb.org/docs/finding-data): upstream search already considers original, translated and alternative titles; do not mirror the catalog.
- [Flutter performance](https://docs.flutter.dev/perf/best-practices): lazy builders, bounded layout, localized rebuilds; avoid expensive intrinsic measurements.
- [Netflix recommendation overview](https://help.netflix.com/en/node/100639): row selection, row ordering and within-row ordering are separate personalization decisions. Nex does not have the data scale for collaborative ML.
- [OpenAI web search](https://developers.openai.com/api/docs/guides/tools-web-search): use cited sources for current facts; application authorization and deterministic identity remain separate from generation.
- [TMDB discovery](https://developer.themoviedb.org/reference/discover-movie) supports origin-country and original-language retrieval. Country is not assumed to mean language; compound interests can supply targeted candidate sources without changing the user's hard filters.

## Initial findings

- Exact TV context is special-cased; movie cards retain only title/type/ID; no common person/episode/channel reference path.
- `recentDisplayedItems` limits rows before selecting the newest message, allowing timestamp ties/truncation.
- Flat preferences lose conjunctions; extraction confidence is not retained in direct-evidence weight. Ratings spread dislike over every trait, including incidental actors/country.
- Home duplicate counts reset per batch; small shared pools starve category-specific rows.
- Search hydrates up to 20 full records; warm metadata cache still makes separate database reads per title/availability.
- Taste is cached but fetched as a full profile and displayed as flat rows. Needs user-facing grouping/control, not just more rows.

## Verification

### Implemented decisions

- Chat uses the existing expiring context and displayed-card tables. Movie/series/library-preview/broadcast cards retain verified identities; person and episode focus supports follow-ups. Ordinals refer to the card set, while singular pronouns can refer to the latest focused entity. Ambiguous action targets ask for clarification. Library/reminder writes still require the existing confirmation protocol. Foreign broadcast references retain their own country, day and channel.
- Ordinary clear first-person preference declarations can update Taste without an explicit “update Taste” command. Confidence and strength are distinct. Temporary, uncertain, hypothetical and joking statements do not become durable traits. “This kind” asks what aspect the user means instead of inferring a whole genre.
- Compound preferences retain AND conditions, with alternatives inside each condition. Direct corrections override inferred traits; title-derived evidence decays gently over a year. A single disliked title does not mean every actor/genre in it is strongly disliked. Existing weak Seen/Want-to-see rules and explicit-rating precedence remain intact.
- Home, Chat and Pick share retrieval/ranking. Strong country/language/compound/person interests can retrieve candidates, not merely re-rank a popular pool. Home uses a stable shelf plan, strict cross-batch deduplication and bounded sparse-row refills. Specific requested concepts never silently fall back to unrelated popular titles when no evidence exists. Pick retains runtime, service, mood, familiarity and exclusion constraints.
- Taste now offers a concise summary, topic/polarity filters, search, strongest/recent ordering, optional inferred patterns, editing and forgetting. Entries remain cached and the list is lazily rendered; no artificial visible-entry truncation.
- Search preserves exact matches, uses TMDB's original/localized/alternative-title search, and adds bounded token/accent/typo ranking plus a small encountered-title fallback. Normal title search no longer hydrates every result's full detail/availability.
- Public metadata has bounded process caching, request coalescing and batched title/availability database reads. A cold worker test verifies two cache SELECTs for a discovery response plus its cached title batch, instead of per-title lookup pairs. No private profile data enters the public cache.
- TV is one guide with fixed channels, an aligned six-hour horizontal timeline, lazy vertical rows, twenty-channel network pages, two-minute bounded page caching, inline favorites and debounced persistent search. Favorites lead; populated channels precede empty ones within that group. Empty channels remain searchable, not silently hidden. Larger text expands row height.
- Entertainment questions use verified TMDB title/person/episode credits and EPG first. Current/explanatory gaps can use OpenAI web search with clickable inline citations. The model cannot execute actions or manufacture canonical IDs. Unsupported facts remain unknown; no new paid data provider was added.
- Normal TV/chat prose omits unnecessary timezone/internal context. Reminder confirmations retain exact scheduling detail where it prevents mistakes. Preparation is a minimal N-logo fade, with reduced-motion support and no artificial wait.

### Verification performed — 9 October 2026

- Backend typecheck, lint, build and 184 tests passed. Added tests cover compound scope, inferred decay, exact-search protection, ambiguity, person/card focus, episode credits, foreign-card reminders, library-preview context, ownership/deletion, guide paging, cross-batch deduplication and cache isolation.
- Flutter analyzer clean; 73 ordinary tests passed. Fourteen opt-in visual/live tests are skipped in the ordinary command, not silently counted as passed. The major-screen visual suite was run separately in dark, light and narrow/large-text layouts; the light pass was repeated after contrast fixes. A real large-text guide overflow was found and fixed. Android debug APK built successfully.
- Real Flutter HTTP integration and real Home/TV widget rendering against the deployed backend passed, including authentication, library flags, Taste, recommendations, favorites, confirmed Chat actions, session restoration and logout. Tests were updated for the existing asynchronous Home startup and confirmation-before-write contract.
- All 26 live persona scenarios passed behavioral assertions; synthetic accounts were removed. Follow-up reruns for compound international interests and relationship/story requests also passed after the final retrieval changes. These are constraint/safety regression checks, not proof of perfect subjective taste matching. Some nuanced requests legitimately returned shorter/empty results or conservative fallback prose.
- Live deployed checks passed for Better Auth, Turso persistence, compound Taste, forgetting a preference, country-scoped EPG/favorites, TMDB card → director → person follow-ups, cited current entertainment knowledge and clear-chat/account deletion. Disposable accounts were deleted; no existing user's account was used.
- The final deployment also passed a real TV-card → “remind me 15 minutes before this” flow: zero reminders before confirmation, then exactly one reminder for the displayed broadcast with the correct offset. This verifies server persistence and targeting, not Android notification delivery.
- All six Home batches were fetched from production twice: 435 distinct titles, no cross-row/batch duplicates. The first six rows had 20 titles each. Later rows ranged from 4 to 20; unsupported/empty shelves were omitted. Pick's movie/runtime constraint passed.
- All nine EPG countries were synced successfully. Switzerland needed a retry after a transient failure. The existing retention cleanup removed 62,080 expired EPG rows; these are replaceable provider listings, not user data. Existing seven-day-past/fourteen-day-future retention was retained. No schema migration was necessary for these changes.
- Known-secret scan checked 1,016 source/artifact text files with zero matches and without printing credentials. Uploads used the existing explicit backend-only allowlist.

### Observed performance (not an SLA)

Production baseline before changes: exact search 3,296/408 ms, Home first batch 10,540/975 ms (first/repeat samples). Final production samples: exact search 563/310 ms, typo search 518/251 ms, Home first batch 849/778 ms, live TV 469/208 ms; the new guide measured 318/286 ms. Search response size fell from 21,110 to 17,100 bytes for the same 20-result query.

The first broad catalog run had later batches taking 6–30 seconds. After cache batching, the repeated six-batch run measured 875, 1,291, 5,410, 1,137, 1,115 and 468 ms. The dataset/cache had been warmed by earlier runs, so these numbers do NOT establish a controlled cold-start speedup. Fresh catalog retrieval and AI answers still depend on external-service latency. Final sampled Chat paths were roughly 3–11 seconds; earlier web answers took up to 26 seconds.

### Deployment and remaining limits

- Backend deployment `dpl_9gKnAnpzfxiU2s1ZUiNQj8Yqw4Eb` reached READY on both existing production aliases, including `https://nex-three-omega.vercel.app`. No mobile deployment or secret/environment migration was required. Source changes are local and have not been committed/pushed by this pass; a later Git deployment must include them to avoid replacing this version.
- No Android device was attached during final verification. Native notification delivery, physical-phone gestures/frame timings, trailer launching and OS lifecycle behavior were not manually re-tested on a handset. The debug APK build and Flutter HTTP/widget tests are not substitutes for that.
- Free EPG coverage is provider-dependent and bounded to the existing selected-channel sync budget plus favorites. The directory can include channels without listings. The daily GitHub workflow exists, but its remote execution/secrets were not verified; manual sync success is not proof the scheduler is healthy.
- Search is not a full local index: a typo unknown to both TMDB and the encountered-title cache can still miss. Episode/person answers depend on available credits; cancellation/news answers depend on verifiable sources. Ambiguous references intentionally clarify.
- Catalog labels cannot guarantee content suitability, endings, or every subtle story concept. User testing remains necessary to judge subjective recommendation quality. No embeddings, vector database, collaborative-filtering infrastructure or extra paid provider was introduced for this private-group scale.
