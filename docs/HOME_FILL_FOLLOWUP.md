# Home row filling and improvement-list audit

10 October 2026. This follow-up corrects the earlier incomplete row-fill work.

## Implemented

- Twenty is now the retrieval target after eligibility filtering, watched/rated exclusions and cross-row allocation, rather than merely the output maximum. Rows at 12–19 are refilled too.
- Scarce shelves allocate ahead of broad non-lead shelves. The lead row remains present and avoids taking scarce-category titles when sufficient alternatives exist. No cross-batch duplicate relaxation was introduced.
- Era, recent-release and acclaimed shelves use TMDB date/rating/vote filters; mood shelves use relevant genre/keyword retrieval hints. Every title still has to satisfy the actual shelf definition and the user's filters.
- Mixed-media shelves can refill from series as well as movies. Movie-only filters do not broaden to series. TV's combined genre buckets now match the corresponding movie-style filters without rewriting title metadata.
- Semantic preparation interleaves promising candidates from each current shelf. Its existing 384-candidate bound no longer simply privileges whichever source was fetched first.
- Retrieval remains bounded: three concurrent discover requests, 24 additional pages per batch, six pages per source and a 25-second refill scheduling window. In-flight requests can extend beyond that window. Empty/repeated/failed sources stop; no unrelated padding or filter widening.

## Real-catalog results

Synthetic Romanian Netflix profile, six batches, existing public TMDB cache, no real user-profile changes: **576 distinct titles in 31 rows**, no cross-row/batch duplicates. **26 rows contained 20 titles.** Narrow remaining rows: bittersweet 14, cerebral 8, weird 19, underdog 10, found family 5. The earlier movie-only refill attempt and final mixed-media run were both inspected.

These short rows mean the bounded retrieval did not find enough additional eligible, unused matches. They do not prove that no other suitable titles exist anywhere on TMDB. Preserving row meaning is preferable to silently adding irrelevant filler. A small watchlist/history and restrictive user filters can also legitimately produce fewer than twenty.

Observed batch times in the final catalog run: 9.164, 8.844, 13.819, 6.964, 5.116 and 0.383 seconds. These are mixed-cache local-to-provider samples, not an SLA or a controlled speedup comparison. Increasing candidate coverage has a latency cost on uncached sources. Existing lazy client batches and public response/title caches are retained.

Raw row counts: `evaluations/home-fill.json`.

## Audit of the earlier thirteen areas

1. Conversational context: existing displayed-entity/session layer and ambiguity tests retained; no parallel memory added.
2. Natural preference learning: persistent/temporary statement guards and grounded extraction retained.
3. Taste representation: existing structured evidence plus opt-in semantic layer retained; no reset or re-rating required. Working-set bounds are documented, not represented as whole-catalog understanding.
4. Home: incomplete refill and broad-row allocation corrected in this follow-up; remaining narrow-row counts explicitly reported above.
5. Pick: shared scorer/semantic adapter retained; combined TV genre matching applies through the shared filter path.
6. Taste UI: existing summary, topic/polarity/search controls, editing/forgetting and lazy list retained. API still returns the complete profile; rendering is lazy, not server-side profile pagination. Very large-profile network scaling remains a known limitation.
7. Search: conservative normalized/token/fuzzy reranking and upstream aliases retained. Not a complete fuzzy index of TMDB.
8. Performance: cached/coalesced public retrieval retained; bounded refill and category-balanced semantic work added. No claim that all cold requests are now instant.
9. TV guide: existing unified timeline, paged channels, favorites and search regression tests retained. Native gesture/frame performance needs a connected handset.
10. Entertainment knowledge: existing structured TMDB/EPG grounding and cited web fallback retained; not a guarantee of every fact or provider coverage.
11. Entity layer: existing canonical displayed/context identities retained and covered by regression tests.
12. Answer metadata: existing normal-prose cleanup retained; exact scheduling context remains for reminder safety.
13. Loading screen: confirmed the previous three-card/text animation is replaced by the minimal N fade, with reduced-motion support and no artificial navigation delay.

This audit does not claim every historical request is perfectly solved. Physical Android notification delivery, deep-link behavior and large-profile production latency were not manually verified in this run; no phone is attached. EPG scheduler health is not inferred from a successful app test.

## Verification

- Backend typecheck/lint/build and all 203 tests passed, including six new row-fill/coverage regressions.
- Flutter analyzer passed; 75 tests passed, 17 opt-in checks skipped (not counted as passed). No mobile source change is needed for this backend response-compatible correction.
- All 24 semantic personas rerun: all 46 predefined preference pairs passed, with zero new OpenAI calls in that cached run. This is regression evidence, not proof of subjective enjoyment.
- No database migration or user-data reset is required by this follow-up.

References used: [TMDB movie discovery](https://developer.themoviedb.org/reference/discover-movie), [TV discovery](https://developer.themoviedb.org/reference/discover-tv). Provider filters are retrieval hints; server-side eligibility remains authoritative.
