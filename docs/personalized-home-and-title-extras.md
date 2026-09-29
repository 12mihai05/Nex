# Personalized home and title extras

Implementation: rank shelf definitions by confidence-weighted taste with negative
preferences, stable first row and diversity penalties. Keep a page plan stable
across batch requests; rank eligible titles with the existing recommendation engine.
Do not add AI calls or paid services. Preserve hard filters and explicit ratings.

Expose authenticated, cached TMDB extras separately from catalog cards: trailers
and season summaries on title open; episodes and season trailers on season open.
Use provider video links on demand, never download or rehost video. Unknown runtime
or rating stays unknown; season selection prevents loading every episode at startup.

Reminders include program, channel and local start time. Verify normalization,
personalization, negative preferences, pagination stability, Flutter states, and
existing regression suites before handoff.

Implemented details:
- Up to 36 row definitions; six per batch. Strong category dislikes suppress
  dedicated rows, while eligible cross-genre matches retain normal title scoring.
- Stable first row and an available unseen watchlist row. Other definitions use
  confidence-weighted taste, limited daily rotation, and category-spacing penalties.
  Within each batch, actual candidate scores and sufficient results influence order.
- The mobile API client carries the initial definition plan between batches, so
  changed taste cannot shift offsets. Fresh confirmed refreshes create a new plan.
- Authenticated title extras and season endpoints cache/coalesce TMDB requests.
  English/unlabelled trailers are preferred, with an all-language empty-result
  fallback. Only validated YouTube trailers/teasers are exposed, official first.
- Trailers open the original YouTube app/browser, not an embedded autoplay player.
  All returned trailers are accessible through the expandable list. Episodes load
  per selected season; large seasons reveal 20 at a time, without extra requests.
- Reminder creation/listing and Chat action payloads carry channel names. Newly
  scheduled device notifications show title, channel, local start time and offset.
  Existing OS notifications need to be recreated to use the new copy.

Research: Netflix's public recommendation explanation and historical personalized
homepage engineering article; TMDB movie/series/season videos and season-details
documentation. No Netflix private APIs, playback history, or proprietary assets.

Verification: backend regressions, Flutter analysis/tests and Android debug build;
live TMDB movie trailers, series seasons, season trailers/episodes and cached reads;
live personalized discovery with owned-service checks. Dark/light detail widgets
rendered and inspected. Physical notification delivery and launching YouTube on an
attached Android phone remain device checks (no phone connected during this run).
