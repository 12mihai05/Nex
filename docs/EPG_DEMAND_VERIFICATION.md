# Country-demand EPG imports (2026-10-14)

## Behaviour

- XMLTV sync imports every valid programme from the configured feeds inside retention, for all permitted channels. The old 120-channel schedule cutoff is removed. Adult-channel restrictions remain.
- Daily GitHub Actions selects countries with profiles, plus countries within 14 days of their last profile leaving. Countries already imported before this migration but with no profiles stop fetching immediately; their cleanup clock starts at migration, without inventing historical usage.
- Database triggers track profile creation, country changes and deletion (including account cascade). Last departure starts grace; return resets it. Counters are not trusted: actual profiles are checked before sync selection and cleanup.
- After grace, schedules, unused channel identities, matches and sync records are removed. Favourite-linked channel identities remain inactive so private favourites survive. The tiny country lifecycle row stays for coordination.
- A first selection can start an authenticated, deduplicated Vercel background import, without a new queue/service or GitHub credential. It has the function's 300-second limit, not unlimited background execution. Daily GitHub sync is recovery; failed/killed imports have a retryable lease/cooldown. No guarantee of instant source availability.
- TV guide exposes ready/preparing/not-loaded/unavailable states, polls while visible, displays matching skeleton rows, and offers retry after failure. Normal empty search results are separate from preparation.
- Configured-feed count and download/decompression safety bounds remain. Exceeding the feed bound fails explicitly; it no longer silently truncates sources.

## Verification so far

- Production profile aggregate: one RO account, no profiles in other countries. New scheduler selected only RO.
- Additive migrations 0010/0011 applied to real Turso.
- Full RO import: 44,982 rows. Read-only parity check against the configured provider: **0 missing retained programme IDs**.
- Future RO channel coverage: **126 -> 344**. Provider: 358 eligible channel identities; 14 lack future listings. Twelve adult channels excluded from the upstream 370.
- RO1: 46,385 raw programme entries, 46,383 valid normalized entries. RO2: 148 channel identities, only 217 entries for three channels; not blindly added as an equivalent replacement.
- Existing whole database allocation approximately 152 MiB, including still-retained inactive countries. No paid upgrade enabled.
- Optimized full RO repeat import: 78.34 seconds from this machine. This is a measurement, not a cold-start SLA.
- Backend: 268 tests passed, typecheck/lint/build passed. Flutter: analyzer clean, 102 tests passed, 20 opt-in tests skipped. Android debug APK built. Physical Samsung testing remains user-run.
- New tests cover full import beyond 120, XMLTV dates/repeated fields, shared claims/retries, account changes/deletion, grace/reset, favourite-safe cleanup, running-sync protection, and skeleton-to-guide completion.
- Dependency audit: zero known vulnerabilities after compatible source-map-js patch.

## Deployment and Chat follow-up

- EPG commit `31cd56a` deployed READY on Vercel; manual GitHub EPG workflow `38468319945` succeeded.
- Production authenticated API pagination verified 344 nonempty channels in the checked six-hour window. Preparation endpoint rejects unauthenticated calls and returns ready without starting another import for loaded RO. Disposable RO account deleted after verification; real account untouched.
- TV Chat now uses model-planned, validated schedule/next/title-airing/recommendation intents. Named-title questions reuse the detail-page broadcast lookup. Recommendations exclude off-air placeholders, shortlist favourites plus alternatives, and use actual Taste with grounded listing metadata. Returned model IDs must exist in supplied listings.
- Read-only personal Chat retrieves the signed-in user's Taste, ratings, Seen, watchlist, reminders and settings/favourite channels. Reads are paged with counts; a sample is not represented as the full profile. Missing Seen is not evidence the user never watched a title. No credentials or other account identity are exposed to the model.
- Real OpenAI tests with synthetic local accounts verified Taste explanations, current PPV2, next PPV2, a standalone yes to a TV clarification, personalised TV choices, named-title lookup, and unrelated-task rejection. An initial unnecessary preference clarification was caught and the planner instructions corrected. These are scenario tests, not a guarantee of every possible model response.
- Dormant cleanup uses one atomic database batch rather than many network round trips inside an interactive transaction.
- Final backend verification: 278 tests passed across 36 files; typecheck, lint and build passed. Real AI rerun passed all seven synthetic scenarios after the clarification fix. Representative local live-AI latency was 4–6 seconds for factual TV follow-ups, about 8 seconds for Taste explanation and 15–16 seconds for personalised TV selection; this is not an instant-response claim.

## Limits and manual checks

- Source metadata such as credits/episode numbering is not yet fully persisted; not every optional XMLTV field is exposed in Nex. Imported schedule coverage does not mean every programme is linked to TMDB.
- Fourteen upstream eligible RO channel identities currently have no future listings. No fabricated schedules or new data provider were added.
- Full cold-country preparation is covered by repository/widget tests, but not proven on a physical phone or an empty production country. It remains bounded by Vercel's 300-second lifetime and provider availability, with retry/daily sync recovery.
- The 14-day production purge has not elapsed; synthetic tests cover grace, return, deletion, active-sync safety and favourite preservation.
- Ask Chat what is good on TV, what is next on one specific channel, when a named film airs, and what your saved Taste says. Check the displayed channel/time against the TV guide. Rebuild Flutter for the new country-loading UI; backend-only Chat changes do not require reinstalling.
- Chat cannot promise to know all user data or every entertainment fact. It reads relevant authorised fields, preserves normal write confirmations, and reports missing evidence. Editing/removing Taste remains available in Profile; no unimplemented Chat deletion capability is promised.

References: [XMLTV format](https://github.com/XMLTV/xmltv/blob/master/xmltv.dtd), [current EPGShare directory](https://epgshare01.online/epgshare01/), [Vercel background lifetime](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#waituntil).
