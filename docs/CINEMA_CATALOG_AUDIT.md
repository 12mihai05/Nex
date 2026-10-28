# Full Romanian cinema catalog audit

Audit date: 2026-10-28. Sources: Cinema City Romania and Cineplexx Romania. No new provider or AI usage.

## Scope and results

- Fetched all current/upcoming source entries: 105 Cinema City and 91 Cineplexx (196 source variants, not 196 distinct films).
- Checked every Cinema City detail page and every Cineplexx public movie-detail identity. All 196 resolved to the expected source record.
- Compared every entry with the shared production database: no missing membership, date, or current/upcoming flag mismatches; no enrichment failures.
- Rechecked all matched movies against fresh TMDb identity facts, credits, alternative titles and translations. Matching improved from 122 variants / 76 distinct movies to 141 variants / 87 distinct movies.
- Remaining 55 unmatched variants: 34 theatre/opera/ballet/concert or other event listings, and 21 movie variants without sufficient unambiguous matching evidence. Some movies are matched through the other chain. These entries are retained internally, but not attached to a guessed TMDb movie.

## Bugs corrected

- TMDb searches can return an English display title even when searching an original-language title. Matching now checks both title fields.
- Explicit original-year suffixes are separated from title text and used as identity evidence. A cinema rerelease year is not treated as the original production year.
- More than six same-name results no longer automatically block a uniquely credited match. Candidate processing remains bounded and fails conservatively when its budget is exhausted.
- Repeated actor names count only once. Shortened titles require stronger director/cast evidence; ambiguity still blocks publication.
- Cinema City Runner's current normal version is preferred over its later Hungarian dub. The later dub does not put the movie back into Upcoming or create a new premiere alert. A sole Hungarian version is labeled in details.
- Cineplexx links now open the film-specific page instead of the homepage. Dune and Dune: Part Two were also opened in a browser and showed the correct film, director, duration and December 4 listing. No ticket sessions were available yet; a future listing is not a promise of bookable sessions.
- TMDb-only future rereleases are selected using future theatrical dates without overwriting the movie's original year.
- Current listings use the user-facing wording "In cinemas now."

## Verification

- Backend: 426 tests across 44 files; typecheck, lint and production build passed.
- Flutter: 140 tests passed, 20 existing skips; analyzer passed. No physical-device check in this audit.
- Secret scan: 1,459 files checked; no credential matches.
- Full production source/database audit passed after import: 141 matched variants, 87 unique titles, zero membership mismatches or identity-review flags.
- Baseline deployed endpoint audit checked all 76 then-matched movies, all Upcoming pages and UK isolation, with no failures. Repeat the updated deployment audit after publishing these fixes; it additionally checks standard-version preference and film-specific Cineplexx links.

Reproducible checks: `backend/scripts/audit-cinema-catalog.ts` and `backend/scripts/audit-cinema-deployment.ts`. Reports contain public movie facts/counts only and are saved under ignored `.tooling/`. The deployment audit uses a disposable account and deletes it afterward.

## Limits

This audits every entry supplied at the audit time, not every film that may exist outside these feeds. Source changes, missing metadata and unavailable provider pages remain possible. Conservative matching, freshness limits and source links remain necessary. No changes were made to real-user preferences or libraries. No new database migration is needed.
