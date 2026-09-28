# Nex usability and discovery refresh

- Preserve the existing recommendation weights, privacy, country isolation, and Chat pipeline.
- Make onboarding country selection local-first; fetch country-scoped providers without mutating the profile on every tap. Ignore stale responses and cache provider lists per country.
- Show a dedicated cinematic preparation screen with real saving/taste/discovery phases, duplicate-submit prevention, accessible motion, and recoverable errors.
- Build up to 10 personalized Streaming shelves with up to 20 grounded titles each. Share a bounded candidate pool, preserve provider constraints and explicit feedback, diversify shelf contents, and never invent award credentials.
- Keep loaded Streaming snapshots stable across navigation and taste edits. Confirm intentional refresh; invalidate when country/services change to avoid incorrect availability.
- Separate title search from conversational requests; debounce, cancel obsolete requests, distinguish loading/error/empty results.
- Improve warm light-mode surfaces and semantic contrast, retaining burgundy accents and cinematic artwork.
- Give TV a live horizontal programme shelf and prominent country-specific favorite-channel access while retaining the complete searchable guide.
- Verify with backend/Flutter regression tests, Android build, live catalog checks where feasible, and rendered light/dark screen inspection. Do not expose secrets or deploy unrelated changes.

Research: Material accessibility guidance for status feedback and reduced motion; TMDB Discover's region, provider, keyword, and genre filters. No paid providers or infrastructure.

## Implementation verification — 2026-09-28

- Onboarding: 18 genres, 16 moods/styles, 28 story concepts. Explicit choices enter separate genre/mood/keyword taste dimensions. A cross-language regression test reads the actual Flutter choices and verifies each contributes supported ranking evidence. Metadata gaps are not filled with invented traits. Existing weights, diminishing returns, negative feedback and weak seen/want hints are preserved.
- Country selection updates locally before network completion, caches per-country providers, and ignores late replies. Provider fetching no longer writes the profile. The services step cannot advance while its request is pending.
- Completion uses animated film cards and actual save/taste/discovery phases; completion is persisted only after successful loading. Errors return to a retryable onboarding screen.
- Streaming has up to 10 shelves of up to 20 titles, per-shelf deduplication, at most three appearances per title, and sparse-shelf suppression. Current snapshots remain stable during navigation/taste changes; explicit refresh has a confirmation sheet. Country/services changes still invalidate availability-dependent results.
- Live TMDB test with a synthetic Romanian underdog/Mystery profile and selected providers returned 10 shelves, 93 distinct titles, all with included availability. Nine shelves had 20 titles; the grounded underdog shelf had 14. Observed local latency: 20.2 seconds cold, 3.963 seconds cached. These measurements are not a production SLA.
- Candidate calls run in batches of three, with at most eight concurrent TMDB requests. Metadata requests coalesce across shelves. Public cache data is shared; provider ownership is applied separately per viewer, with a concurrent isolation test. Only the lead shelf records recommendation exposure, not all off-screen titles.
- Search is title lookup with immediate loading feedback, debounce/cancellation, stale-response protection, and separate empty/error states. Complex requests are directed to Chat.
- TV has horizontal live/upcoming cards, programme details, reminders and prominent country-specific favorite-channel access. The full searchable guide is retained. Channel filtering does not refetch programme shelves unnecessarily; passive schedule refresh is bounded to five minutes.
- Theme: richer burgundy, light-mode semantic surfaces/text, readable chip typography. Main text/primary contrast assertions pass. Fixed large-text TV-card overflow and short-screen refresh-sheet clipping found during testing.
- Sign-in uses secure device storage and Better Auth's sliding session mechanism: 365-day inactivity expiry, renewed after the daily update threshold. Real local Better Auth signup, signed-bearer restore, renewal and logout invalidation pass against migrated in-memory SQLite. This is intentionally not an irrevocable, infinitely valid bearer token. Old expired sessions require signing in again.

Validation completed:

- Backend typecheck, lint, build; 131 tests across 18 files passed.
- Flutter analyzer: no issues. 24 ordinary tests passed; two credential-dependent live tests and three opt-in visual tests skip in the default suite.
- The three visual variants were separately enabled and passed: dark, light, and 360px-wide/1.4x text. Screenshots are local under `mobile/build/verification`; dark rendering was repeated after the chip-font correction.
- Android debug APK built with the public API URL `https://nex-three-omega.vercel.app`. Existing Android desugaring configuration was preserved.
- New discovery and provider endpoints reject unauthenticated requests; personalized responses remain private/no-store. No paid infrastructure or data provider added.

Not claimed: a new full live-AI persona rerun, production deployment of these changes, or a physical-phone walkthrough of this revision. Chat testing remains deferred as requested. Hosted-backend/mobile end-to-end tests must be rerun after deploying the new backend; old deployments use the mobile compatibility fallback and will not show the full new shelf set. No new database migration or environment variable is required for this change.

References used: [TMDB Discover movie filters](https://developer.themoviedb.org/reference/discover-movie), [Better Auth session management](https://better-auth.com/docs/concepts/session-management), [Material progress feedback](https://m3.material.io/components/progress-indicators/overview).
