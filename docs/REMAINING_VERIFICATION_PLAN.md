# Remaining reliability pass

1. Diagnose Switzerland's runner-only EPG failure with safe error codes/stages; keep atomic country snapshots and retention. Verify the scheduled workflow, not just local sync.
2. Reuse cached semantic evidence when AI quota is exhausted without increasing spend or reusing outdated private preferences. Test partial caches, changed profiles and exclusions.
3. Measure Home retrieval/cache costs. Improve relevant narrow-category retrieval and remove redundant round trips; never pad a row with unrelated or unavailable content.
4. Re-run backend, mobile, authorization and regression checks. Verify physical Android behavior if a device is connected; distinguish device tests from widget/build checks.
5. Push/deploy the tested backend, check production and report actual timings, remaining limits and any unavailable verification.

Architecture stays intact: existing repository caches, shared ranking pipeline, Turso transactions, free GitHub scheduler, and backend-only secrets. No duplicate taste system or full TMDB mirror.
