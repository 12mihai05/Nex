# Library filters and programme reminders — 2026-10-10

- Upcoming moved inside the Home Filters sheet, without changing existing Home filters when entering/leaving it. No new provider or backend change.
- Upcoming now distinguishes an empty intermediate page from no further results and states that missing local TMDB dates mean a film can remain searchable but absent from the local cinema list.
- TV programme details have a fixed reminder footer, independent of long descriptions/cast or delayed enrichment. Live/ended programmes explain why a new pre-start reminder is unavailable. Saved reminder editing and custom minutes remain unchanged.
- Both libraries now offer title search, All/Movies/Series, genre, movie-duration range and optional included availability on selected profile services. Filters never modify saved/history flags, Taste or profile subscriptions. New-to-me/rewatch and Upcoming do not appear in the library filter modal.
- Full title metadata loads only when needed for metadata filters, 12 saved titles per batch and at most 4 requests concurrently. Results are retained for the screen session; country changes invalidate them. Remaining titles and failed lookups are explicit rather than silently dropping the rest of a large library. No fixed total-library cutoff is introduced.
- Flutter analysis passed, 101 regular tests passed, 20 opt-in tests skipped; two visual tests separately passed with dark/light screenshots reviewed. Android debug build passed. New regressions cover Home filter preservation, interim empty pages, long programme descriptions, live programme messaging, combined library filters, 36-title batching and unchanged saved flags in both libraries.
- No physical Samsung UI/OS notification test was performed. No backend code changed in this pass.
