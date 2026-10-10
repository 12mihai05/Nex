# Release discovery and notifications

## Product rules

- Search includes upcoming titles regardless of streaming availability. A bounded typo fallback runs only when TMDB has no strong title match; exact searches retain their ranking.
- Streaming > Upcoming is a separate country-specific cinema calendar. No service, minimum-rating or Seen filters are applied. It pages through TMDB results (provider ceiling: 500 pages), removes dates on/before the selected country's current day, and labels dates as cinema dates, not subscription availability. Unknown regional dates remain searchable, not falsely placed on the local calendar.
- Normal recommendations exclude known future primary release dates. Search and title details do not.
- Details show known upcoming seasons and dates; each season also retains its air date. Movie details distinguish regional release dates from the general first-listed date. Dates are tentative calendar dates, never timezone-shifted midnight timestamps.
- Explicit cinema/digital release alerts do not modify watchlist, ratings or Taste. Digital can mean rental/purchase, not subscription streaming.
- Settings > New seasons opts into tracking Seen series. Existing history is baselined on the first check, without old-season notification spam. Specials are excluded. Existing tracked series can be paused/resumed in their details. Turning the global setting off pauses season delivery.
- Country changes pause alerts for the previous country. Switching back restores their eligibility; there is no silent reassignment of cinema dates.
- TV guide programme sheets show EPG details first, add cast only from a confident existing TMDB match, and open reminder controls in a second view. Provider failure does not block reminders.

## Setup: Android first, no paid infrastructure

1. Apply additive Turso migrations with `npm --workspace backend run db:migrate`. Back up/manage credentials using the existing private deployment process.
2. Create a Firebase project on the no-cost Spark plan and register the Android application ID from `mobile/android/app/build.gradle.kts`. FCM does not require Firestore, Firebase Auth, Analytics, Cloud Functions or a billing upgrade. Keep Analytics off unless intentionally wanted.
3. Enable the Firebase Cloud Messaging HTTP v1 API. Provision a dedicated service account with the permission to send FCM messages for this project, not a broad Owner role. Put its JSON in the encrypted GitHub secret `FIREBASE_SERVICE_ACCOUNT_JSON`. Never paste it into chat, source code, build arguments or the app.
4. The workflow also needs existing encrypted `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `TMDB_READ_ACCESS_TOKEN`. `release-sync.yml` runs separately from EPG, at 09:41 UTC, with a 12-minute timeout, concurrency protection and read-only repository permission. Set repository variable `RELEASE_ALERTS_ENABLED=true` only after setup. Until then the job is intentionally skipped, not a recurring broken deployment.
5. Download the Android **client** `google-services.json` into `mobile/android/app/` (Git-ignored). The optional Google Services plugin then generates native resources, needed for closed-app delivery. Run Flutter with `--dart-define=RELEASE_PUSH_ENABLED=true` plus the usual `API_BASE_URL`. Do not put service-account JSON in this file. An explicit public-options path also supports `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_API_KEY`, but Android still needs its native resource configuration for cold-start delivery. Never use your backend `.env` as Flutter build defines. The Firebase client API key is not a service-account credential; restrict it to the intended application/APIs as Firebase recommends. Separate Android and Apple app IDs are required.
6. On Android, allow notifications, enable New seasons or a movie's release alert, and run the workflow manually to verify the setup. Missing Firebase configuration leaves browsing and local TV reminders operational; the UI does not claim alerts were enabled.

Apple delivery additionally needs an Apple Firebase app, APNs credentials, Push Notifications capability and physical-device testing. These cannot be fabricated from an Android project. No iOS delivery verification is claimed.

## Delivery and failure behaviour

The worker processes the oldest 200 eligible subscriptions per run and shares fresh TMDB lookups for matching title/country identities. If capacity is reached, the workflow reports it so capacity can be reviewed rather than silently claiming full coverage. This is ample for the initial friends group, not unlimited-scale infrastructure. Free GitHub minutes are shared with other workflows; do not enable paid overage for this feature.

New subscriptions record already-released event identities as baseline. Eligible releases have a known date in the previous seven calendar days, excluding the baseline. Failed provider calls never advance the baseline. Deliveries use per-subscription/event/device receipts, a 15-minute claim lease and a stable notification tag for retries. FCM does not provide an atomic transaction with Turso: in the rare case of delivery succeeding but its receipt write failing, a retry can replace the same notification; this is not a claim of mathematically exactly-once delivery.

Movie checks continue when a local date is missing and can discover it later. Daily checks and upstream data can be late. This is a daily release update, not an exact release-time alarm. Push expires after one day; offline phones, permissions and platform restrictions affect receipt. Invalid device tokens are removed. Devices are tied to authenticated sessions, rechecked before sends, and cascade on session/account deletion. Account-owned subscriptions, settings and receipts cascade on deletion too. Only aggregate counts are logged.

## Manual checks

- Search `Avengers: Doomsday` and `Avangers Doomsday`; inspect date labels. If Romania has no date in TMDB, do not expect it in the Romanian Upcoming calendar.
- Open Upcoming, scroll/paginate, change country, retry after offline, return to ordinary Streaming. Check no subscription-service pills or fabricated availability appear in Upcoming.
- Open an ongoing series, inspect upcoming dates and season dropdown. Unknown dates must stay unknown.
- Tap a TV programme: details first, then Remind me, back to details, enter custom minutes, save/update/cancel. Existing local reminders must still work.
- After Firebase setup, test permission denial, foreground/background/closed-app notification and tap-to-details, movie postponement, daily-job rerun, series opt-out, logout and account deletion using disposable test accounts.

## Verification completed (2026-10-10)

- Backend: 259 tests passed; typecheck, lint and build passed.
- Flutter: 89 tests passed, 19 opt-in tests skipped in the normal suite; the two new visual checks were run separately and passed. Analysis and Android debug build passed. The final skeleton sizing adjustment also passed targeted widget tests and visual review.
- Live TMDB checks verified exact and misspelled Doomsday searches, Romanian/British upcoming pages and unknown season dates. TMDB had no Romanian release date for Doomsday at verification time; its general date is not presented as a confirmed Romanian cinema date.
- The additive Turso migration was applied and the backend deployment reached READY. Production checks verified unauthenticated rejection, RO/GB upcoming results, typo search, subscription creation/validation/disable and settings updates. The disposable account retained an empty Taste/library and was deleted successfully. No existing user account was changed.
- Physical-device interactions, Firebase delivery (foreground/background/closed app), APNs and actual scheduled push execution remain unverified. Firebase credentials/native configuration are absent; the GitHub job is intentionally gated off until configured. Automated worker tests cover baselines, retries, opt-outs, country boundaries, session/device ownership and duplicate suppression, but do not prove delivery to a phone.

Sources: [TMDB discover](https://developer.themoviedb.org/reference/discover-movie), [release types](https://developer.themoviedb.org/reference/movie-release-dates), [FCM Flutter setup](https://firebase.google.com/docs/cloud-messaging/flutter/get-started).
