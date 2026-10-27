# Search and regional release pass

1. Reuse one themed clear-search affordance across Search, onboarding favorites, both libraries, Taste and TV guide. Clearing must notify the existing search logic, invalidate pending requests and preserve other filters.
2. Separate cinema/digital release alert controls with modest themed surfaces, spacing and readable enabled/busy states. Check narrow screens, text scaling and both themes.
3. Audit raw TMDb release dates against published Romanian dates before changing country-specific selection. Never relabel another country's date as Romanian, or interpret missing provider data as proof no announcement exists.
4. Improve release parsing/wording and tests based on evidence. No new external service or automated scraping without the user's approval. Keep release tracking, upcoming results and Chat consistent.
5. Run backend checks/build and Flutter analysis/tests, plus targeted visual review. Document provider limitations and live checks without exposing credentials or modifying real user data.

## Findings (27 October 2026)

Read-only live TMDb checks found no RO release-date records for How to Rob a Bank (1437511), Dune: Part Three (1170608), or Avengers: Doomsday (1003596). The existing country-only parser is behaving correctly for these responses; substituting the primary/US date would be incorrect. The UI now says the source lacks a local date instead of claiming no announcement exists. No external source has been integrated and no curated dates added: the user requested a comparison before choosing a source.

Candidates researched:
- Cinema Romania API: https://vatadezahar.com/api/filme-cinema/documentatie documents Cinema City/CineMAX dates, TMDb IDs and per-source dates. Keys issued manually. Cost, quotas and upstream reuse rights are not yet verified; not claimed to be free or production-tested.
- Cinema/distributor feeds by agreement: best direct provenance; cannot assume public websites imply permission or a supported API. Cinema City lists Dune III for 18 December 2026: https://www.cinemacity.ro/films/dune-partea-iii/8105s2r
- CineMagia: https://www.cinemagia.ro/filme/how-to-rob-a-bank-3328095/ lists 13 November 2026. Broad local coverage, but automated access/reuse needs an appropriate arrangement; see https://m.cinemagia.ro/termeni-conditii/
- Wikidata: CC0 structured data and country-qualified publication dates; Romanian upcoming coverage must be measured before relying on it.
- MovieGlu: documented coming-soon API, commercial pricing; Romanian coverage must be confirmed. Excluded from the free-first implementation unless requirements change.
- Reviewed source-linked supplements or checked web research: useful for gaps, not an automatically complete calendar. Require provenance, freshness, correct release type and explicit conflict handling.

UI implementation reuses one clear-search field in all five search surfaces (both libraries share one screen). Clearing invalidates/debounces existing search logic. Rating buttons are centered, responsive to larger text, with independent compact Seen control. Cinema/digital alert controls have separate themed surfaces and 12px gaps. No changes to rating weights, auth, production data or notification scheduling.

28 October refinement: remove the redundant Clear opinion button. Tapping the active rating continues to clear it through the existing controller. Reduce rating minimum height from 78 to 64, with smaller padding/icons and a maximum group width of 360. Retain readable labels, accessible touch targets, two-column large-text layout, and a screen-reader hint on the selected rating.

Release alerts now form a compact Cinema/Digital pair with 12px separation, distinct Notify me / Alert on states, and per-action Saving feedback. They stack on narrow or large-text layouts. Existing eligibility and follow/unfollow behavior is preserved. Re-rendered and visually reviewed both themes after this change; Flutter analyzer and the complete suite passed again (129 passed, 20 existing skips). Backend runtime was not changed or redeployed for these controls.

28 October follow-up: ratings now use text-only stadium pills with a 40px visual minimum height and the default padded touch target, replacing stacked icons and labels. Four options fit inline at normal text size; large text wraps into two columns. Alert changes update the selected state immediately, save independently per kind, and retain the existing release-data Future without an extra fetch. A failed save rolls back only the affected control. Notification permission does not roll back a saved inbox subscription. Changing the displayed title or leaving the screen ignores stale completion callbacks. Controls remain visible after switching off so the user can switch them back on.

## Verification

- Flutter analyzer clean; latest full suite: 133 passed, 20 existing skips.
- Four additional alert tests cover immediate updates without date reload, concurrent independent saves, rollback/retry, title changes and disposal during saving. Sixteen focused tests passed. Re-rendered and inspected light/dark layouts after the text-only rating change, including layout checks at 1.6x text.
- New checks: conditional clear icon, programmatic changes, single clear callback; light/dark alert spacing and centered Seen control at normal/1.6x text. Existing independent Seen/rating and onboarding stale-response tests still pass.
- Rendered and inspected `mobile/build/verification/detail-controls-light.png` and `detail-controls-dark.png`. No phone verification in this pass.
- Backend typecheck, lint, 400 tests across 43 files, and build passed. Only backend addition is the opt-in read-only audit script; production runtime unchanged.
- No paid AI calls, new third-party integration, migration, commit, push or deployment performed in this pass. Date-provider selection remains pending.
