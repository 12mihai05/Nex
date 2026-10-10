# Release notifications: no Firebase

Nex uses only its existing TMDB, Turso, GitHub Actions and local phone notification integrations. No Firebase account, SDK, key or paid push provider is required. Ask the owner before adding any new third-party service, including a free one (THIRD_PARTY_POLICY.md).

## How it works

- Follow cinema/digital releases from movie details. Enable New seasons in Settings to follow Seen series; existing seasons are baselined without old-season spam.
- GitHub Actions checks daily at 09:41 UTC and saves updates in Turso. Dates are calendar dates; unknown dates stay unknown. Digital can mean rental/purchase, not inclusion on a subscription platform.
- Open Notifications from the Streaming bell or Profile. It lists updates for the selected country in batches of 30, newest first. Opening a title marks that update read.
- Optional Phone popups use the same installed local-notification package as TV reminders. Nex checks on open/resume and every five minutes while active. Catch-up updates are grouped into one popup linking to the inbox. Turning off popups does not disable the inbox or release tracking.
- No remote push: if Nex stays closed, it cannot discover new release updates until reopened. This differs from a TV reminder whose known time was already scheduled on the phone. TV reminders are unchanged.
- Movie/series subscriptions and notifications do not change Taste, ratings, watchlist or Seen state. Opt-outs and country are rechecked before creating updates. Previous-country records remain stored but are not shown in the current-country inbox.

## Scheduler setup

Apply migrations, deploy the backend, push the workflow, then set GitHub repository variable RELEASE_ALERTS_ENABLED=true. Existing encrypted secrets TURSO_DATABASE_URL, TURSO_AUTH_TOKEN and TMDB_READ_ACCESS_TOKEN are sufficient. Never place backend secrets in Flutter. The workflow has a 12-minute timeout, concurrency protection, aggregate-only logs and a maximum of 200 subscriptions per run, rotating by last check. GitHub free minutes remain subject to the repository/account allowance.

Unique subscription/event rows prevent duplicate inbox entries on retries. The worker checks new events within the previous seven days. Provider failures do not advance the baseline. The app acknowledges popup delivery separately from read state; a failed acknowledgement may redisplay/replace the same grouped local notification on a later sync. It does not claim mathematically exactly-once phone display. Permission/OS restrictions can suppress visible popups; the inbox remains available.

Old push-device/delivery database tables are retained unused to avoid destructive migration; the old sender, registration endpoints, SDK packages and configuration have been removed. Account deletion still cascades legacy rows. Historical migrations are not rewritten.

## Test checklist

1. Open Notifications: empty state, pull-to-refresh, pagination and retry offline.
2. Follow a future movie. Confirm enabling works even when phone permission is denied; the inbox remains active.
3. Enable New seasons, mark an ongoing series Seen, verify old seasons are not announced as new. Disable tracking to prevent future updates.
4. With a release update available, allow Phone popups and reopen Nex. Check one grouped notification, tap to inbox, open a title, return and verify read styling. Repeat sync: acknowledged updates must not produce another popup.
5. Disable popups, switch countries, logout/login as another disposable user: no previous-user notifications or inbox items should appear.
6. Confirm existing TV programme details and custom-minute local reminders still work.
7. Inspect GitHub's manual run and later daily run. Manual dispatch verifies job execution but does not prove a future timed trigger.

## Known separate limitation

Germany's Upcoming discovery can return older cinema re-releases on early pages. Filtering them out leaves an empty page while later pages still exist. The UI now distinguishes this from an exhausted country list and keeps Show more available. Upcoming is accessible inside Home's Filters popup and explicitly describes TMDB coverage limits. A fresh check on 2026-10-10 found no Romanian theatrical release record for Avengers: Doomsday, although other countries have dates. Search remains available; foreign dates are not relabelled as Romanian.

## Verification history

Before replacing Firebase: 262 backend tests (including the now-removed push sender), 89 regular Flutter tests, Android build and a real Flutter-to-production API lifecycle passed. Firebase was never configured or used. Its workflow only passed a safety-gate skip, not delivery.

Replacement verification completed on 2026-10-10:

- 260 backend tests, typecheck, lint and build passed; 93 regular Flutter tests and analysis passed. Android debug APK builds without Firebase packages. Two opt-in visual checks passed; inbox reviewed in both themes.
- The real Flutter API client passed signup/login, search, subscriptions/settings, inbox access, live programme details and custom 17-minute reminder save/cancel against production. Its test account was deleted. Native secure storage and OS notification display were not part of that desktop-hosted test.
- Populated inbox production verification used two disposable accounts and clearly synthetic records. Owner isolation, separate read/popup acknowledgement, country filtering and cascading account cleanup passed. Both accounts were deleted; zero synthetic inbox rows remained.
- Additive migration applied, backend deployed READY, daily scheduler enabled. [Manual scheduler run 38060288867](https://github.com/12mihai05/Nex/actions/runs/38060288867) completed SUCCESS including the actual sync step, using only existing Turso and TMDB secrets. A future timed trigger has not yet been observed for this replacement.
- No existing user account or Taste was rewritten. Physical Samsung popup display, OS permission behavior and cold-start tap navigation still require a device check. No Firebase delivery is applicable or attempted.
