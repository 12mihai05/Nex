# Filters and responsiveness

Plan: retain the stable personalized streaming shelves; add a separate filtered catalog view reachable from streaming, with movies/series, canonical genres and exact inclusive movie runtime bounds. Retrieval and hard filtering stay server-side, with existing personal ranking and owned-provider scope. No AI calls or persistent taste changes for filters.

Separate TV listings and the country-scoped, paginated channel guide into tabs. Keep guide input state stable, ignore stale responses, cache repeated guide queries briefly, and update favorites optimistically with rollback. Expose favorite management in Profile instead of a large repeated TV banner.

Use a reusable, reduced-motion-aware animated skeleton for pending content; disable duplicate pick actions and retain failure/retry states. Reduce light-mode glare, strengthen selected burgundy accents, and explicitly set contrasting system-bar icons without changing the dark palette.

Verify range semantics and authorization on the backend; verify input retention, pending actions, rollback, navigation, light contrast and large text in Flutter. Render actual screens and build Android. Do not expose secrets or change production accounts.

Onboarding follow-up: title-only preview search uses a single TMDB search request without per-result metadata/availability hydration. Selected movie/series identities are stored independently of the current search results and submitted to the existing taste endpoint (five maximum). Full trusted title metadata is resolved by the backend when learning from selections. Debouncing, cancellation, stale-result guards and a bounded in-memory search cache apply.

References consulted: Flutter [TextField controller lifetime](https://api.flutter.dev/flutter/material/TextField-class.html), [system overlay styles](https://api.flutter.dev/flutter/material/AppBar/systemOverlayStyle.html), and TMDB [movie discovery runtime bounds](https://developer.themoviedb.org/reference/discover-movie).
