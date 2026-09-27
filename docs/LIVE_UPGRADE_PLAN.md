# Nex live upgrade and Phase 15

1. Audit actual backend/mobile flows and preserve existing data.
2. Add iptv-org global metadata/guide resolution, gzip support, bounded downloads, per-country sync, retention and failure isolation. Import only configured/active countries, not the entire world.
3. Evolve taste evidence safely; connect reactions/favorites/watchlist to metadata learning; fix temporary context, availability, diverse candidates and recommendation fatigue.
4. Apply additive migrations to local test DB and configured Turso; exercise actual auth and user isolation.
5. Test live TMDB, OpenAI structured outputs, Romania and a second country with sanitized repeatable scripts.
6. Replace implicit demo content in authenticated Flutter Browse/library/TV with backend data and evidence-backed explanations.
7. Run backend/Flutter checks and real client integration, review deployment configuration, record evidence and remaining platform/provider blockers.

No paid infrastructure, global bulk ingestion, vector database, custom ML, or collaborative filtering is introduced. Existing user rows are preserved. Credentials are read only by backend processes and never recorded in reports.
