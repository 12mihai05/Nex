# Progressive Home

Load six shelf definitions per request, with at most six cached TMDB discovery sources and three concurrent source calls. Keep the existing non-batched API compatible. Offer a wider bounded mix of genres, grounded story concepts, moods, quality and eras; omit empty or near-identical shelves. Preserve country, owned services, history and explicit filters on every batch. Do not add AI calls.

Restore the validated session before content hydration completes. Publish the first shelves before library detail hydration and TV requests finish. Append later batches near the end of scrolling, with matching shelf skeletons and explicit retry; never replace already displayed rows. Reset on manual refresh or account/country/provider/filter changes. Guard late async responses across logout.

Verify source bounds, filter correctness, sparse results, stable append, failed batch retry and startup responsiveness; run backend/Flutter regression suites and Android build. Flutter lazy-builder guidance: https://docs.flutter.dev/cookbook/lists/long-lists

## TV detail correction and reminders

The former movie-detail TV section was a static empty-state message. It now calls an authenticated country-scoped broadcast endpoint independently of Home loading. Query all active channels, including non-favorites, using verified TMDB matches or exact TMDB translated titles plus matching release year. Do not guess based on loose sequel-name similarity. Translation aliases use the existing metadata cache. Show informational live/today/tomorrow/in-N-days text, not links. Empty and failed lookups are distinct; the guide cannot prove a title is not airing.

Live verification found Maze Runner: The Death Cure (TMDB 336843) in the Romanian feed as Labirintul: Tratament letal, 2018, on Antena 1 from 2026-09-28 22:15 UTC to 2026-09-29 01:14:59 UTC. The lookup resolves it without modifying the feed or inventing a permanent match.

TV reminder sheet supports quick choices and integer input from 0 to 1440 minutes, with the actual notification date/time preview and future-time validation. Device permissions and successful local scheduling are still required; backend persistence alone is not proof that Android delivered a notification.

## Verification

Real TMDB batch check: 28 nonempty rows, 240 distinct titles across six batches for RO with Netflix/Prime Video/Max. First batch measured 2998ms with the existing metadata cache; not a cold-start guarantee. Client append suppresses near-identical shelves and caps each title at three appearances, so displayed counts can be smaller. No AI calls, database migration, or paid infrastructure added.
