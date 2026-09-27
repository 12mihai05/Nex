# Nex architecture

## System shape

```text
Flutter mobile app
  | HTTPS JSON + Better Auth bearer session
  v
Vercel TypeScript API
  |-- Better Auth + invite-gated registration
  |-- domain services (catalog, taste, recommendations, chat, reminders)
  |-- TMDB repository (metadata, discover, providers, cache)
  |-- OpenAI repository (strict structured outputs only)
  |-- EPG provider interface (XMLTV URL/file or fixtures)
  v
Turso/libSQL via Drizzle
```

The Flutter application only receives the public API base URL. TMDB, OpenAI, Turso, Better Auth, invite, EPG sync, and Vercel credentials remain server-side.

## Backend

The backend is a small Hono application exported through one Vercel function. Hono supplies routing without imposing a full web framework. Zod validates input, output boundaries, environment values, and external payloads. Domain handlers call services; services call replaceable repositories.

Drizzle defines the Better Auth tables and Nex tables in one SQLite/libSQL schema. Repository methods accept the authenticated user identifier explicitly and include it in every user-owned predicate. Transactions are used for multi-row mutations such as account deletion and EPG synchronization.

Better Auth owns password hashing and session lifecycle. Its bearer plugin makes native sessions usable over `Authorization: Bearer`; a pre-handler gates registration with `NEX_INVITE_CODE`. App routes resolve the current session server-side and never accept an authoritative client `userId`.

TMDB data is fetched on demand and lightly cached. Metadata and provider availability have separate configurable TTLs. Exact lookup searches all country providers; discovery defaults to the user's owned services. Fixtures implement the same repository contract.

The EPG subsystem supports XMLTV URL/file, fixtures and a country-aware iptv-org directory adapter with configurable free feeds. Romania/Bulgaria use tested EPGShare01 schedules. Imports bound download/decompression sizes, channels and matching work; transactionally replace future snapshots; retain seven past/fourteen future days; and preserve valid cached data on upstream failure. A database lease prevents overlapping syncs. Daily GitHub Actions imports directly into Turso rather than running inside Vercel time limits. See [EPG sources](EPG_SOURCES.md).

Candidate generation combines discover, favorite-related and watchlist titles. Persisted evidence includes source, timestamp, confidence and strength; explicit corrections override inference. Expiring session filters, owned availability, runtime constraints, calibrated quality, negative feedback, watched/rejected exclusions, fatigue and diversity shape deterministic ranking. V1 authorizes only the current viewer. See [personalization](PERSONALIZATION.md).

OpenAI is an optional orchestration layer. The Responses API returns strict Zod-backed structures for taste extraction, intent parsing, approved chat blocks, and spoiler-safe summaries. Catalog facts and availability always come from TMDB/EPG. Failures fall back to deterministic parsers/composition, and usage is limited per authenticated user/day.

## Mobile

Flutter uses Riverpod for state and side effects, GoRouter for navigation, Dio for the API, `flutter_secure_storage` for the bearer token, cached network images, and `flutter_local_notifications` plus timezone data for reminders.

The shell has Streaming, TV, and Chat destinations, following the user's September 27 override of the original two-tab requirement. Search and Profile remain top-level actions. Profile opens Seen library and Want to see independently. Streaming uses TMDB; the TV screen has live/upcoming programmes, a searchable paginated country channel directory and favorites. The shared cinematic components use a burgundy accent in light and dark themes.

Saved flags and explicit opinions refresh local personal state immediately after successful writes; Chat reads authoritative backend state on each request. Streaming keeps its current ordered snapshot for five minutes, refreshing on re-entry after expiry, scope change or explicit refresh. Seen/rated exclusions take effect immediately, without reranking the remaining cards. A pending-taste banner offers manual refresh. Private responses use `Cache-Control: private, no-store`; only public TMDB data is shared in the backend cache. Search/discover lists have a five-minute TTL, related titles one hour, and genre/keyword data one day, with bounded in-flight request coalescing.

Demo mode uses local fixtures and an in-memory repository while preserving the same interfaces and flows. Live mode uses the backend and gracefully surfaces network, auth, provider, EPG, and AI failures.

## Security and privacy boundaries

- Secrets are validated at runtime and never returned by health/config endpoints.
- Authentication and ownership checks run before every private domain operation.
- Internal EPG sync uses a constant-time secret comparison.
- Expensive AI routes enforce authenticated daily quotas in Turso.
- External values are parsed before persistence; logs exclude credentials and request bodies.
- Account deletion removes or cascades all user-owned application and authentication data.
- Only explicit TV reminders create notifications; no paid push or behavioral spam exists.

## Free-first deployment

Vercel Hobby hosts stateless functions, Turso supplies libSQL, GitHub Actions provides the fallback EPG schedule, TMDB supplies remote artwork/metadata, and device notifications handle reminders. OpenAI is the sole expected usage-priced dependency. All providers sit behind interfaces so free or self-managed replacements can be adopted without changing the mobile product.
