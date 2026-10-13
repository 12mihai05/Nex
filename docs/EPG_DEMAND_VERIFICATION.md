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

## Remaining work in this conversation

Deployment/real API verification; TV chat recommendation selection and PPV follow-up regressions; broader private app-context/Taste/broadcast lookup capability audit. Source metadata such as credits/episode numbering is not yet fully persisted; do not claim that every optional XMLTV field is exposed in Nex.

References: [XMLTV format](https://github.com/XMLTV/xmltv/blob/master/xmltv.dtd), [current EPGShare directory](https://epgshare01.online/epgshare01/), [Vercel background lifetime](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#waituntil).
