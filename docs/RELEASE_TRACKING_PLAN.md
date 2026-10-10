# Release discovery and alerts

Approved scope: country-specific upcoming cinema browsing, unrestricted title search (including unreleased titles), release dates in details, explicit movie alerts, opt-in tracking of Seen series, daily GitHub Actions checks, free FCM delivery, and a details-first TV programme sheet.

Extend the existing TMDB repository, canonical movie/series IDs, Better Auth ownership and Turso migrations. Upcoming is a separate mode, not a watch-now recommendation filter: no streaming-service or rating minimum; paginate in date order. Use regional theatrical release dates, not the movie's global primary release date. Missing regional dates remain searchable but cannot be assigned a fabricated regional release. Date-only values remain calendar dates. Series specials and returning episodes are not new seasons. Premiere does not imply subscription availability.

Release subscriptions and notification delivery state are separate from Taste, watch history and TV reminders. Baseline existing releases when following; send only subsequent eligible events, deduplicate by subscription/event and device, expire stale events, and retry transient delivery failures. Track distinct titles once per sync, with a bounded job and durable progress. User-owned rows cascade on account deletion. Device registrations belong to authenticated sessions so logout/expiry prevents further delivery.

GitHub Actions runs a bounded daily worker with encrypted credentials, separate from EPG. No paid services or always-on server. FCM credentials stay server-side; Flutter requires public Firebase app configuration. Missing Firebase configuration must not break normal app launch, browsing or local reminders and must not claim phone notifications are active.

Validation: dates/regions, empty and postponed dates, season zero, baseline/no historical spam, pagination and midnight changes, search without availability, normal-feed exclusion, ownership/session cleanup, retry/deduplication, lazy programme enrichment and reminder navigation. Run backend lint/typecheck/tests/build and Flutter analysis/tests/build; live TMDB checks when credentials permit. Real push delivery requires Firebase configuration and a physical-device check.

References: https://developer.themoviedb.org/reference/discover-movie ; https://developer.themoviedb.org/reference/movie-release-dates ; https://developer.themoviedb.org/reference/tv-season-details ; https://firebase.google.com/docs/cloud-messaging/flutter/get-started
