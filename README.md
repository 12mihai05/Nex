# Nex

Nex is a private, premium entertainment discovery app for finding movies and series across streaming services and Romanian television. It combines grounded recommendations, natural-language discovery, watch history, explicit taste feedback, watchlists, TV schedules, and local reminders without turning the product into a generic chatbot.

The product has three primary destinations: **Streaming**, **TV**, and **Chat**. This follows the user's September 27 navigation change, superseding the original two-tab requirement. Search and Profile are top-level actions; Profile opens separate Seen library and Want to see screens.

Latest acceptance record: [TV, favorites and Want-to-see verification](docs/TV_FAVORITES_REFRESH_RESULTS.md), including real integrations, persona findings and remaining native/deployment checks.

## Architecture

```text
Flutter (Riverpod + GoRouter)
        |
        | HTTPS JSON + Better Auth bearer token
        v
Hono TypeScript API on Vercel
  |-- Better Auth / invite gate
  |-- deterministic recommendation engine
  |-- OpenAI structured orchestration
  |-- TMDB catalog + provider adapter
  |-- XMLTV EPG provider + matcher
  v
Turso/libSQL via Drizzle
```

The mobile client never connects to Turso, TMDB, XMLTV, or OpenAI directly. See [the architecture document](docs/ARCHITECTURE.md) and [implementation plan](docs/IMPLEMENTATION_PLAN.md).

## Repository

- `mobile/` — Flutter Android/iOS application (plus a web preview target for local visual QA)
- `backend/` — Hono/TypeScript Vercel API, domain services, Drizzle schema, migrations, and tests
- `backend/drizzle/` — committed migration history for Better Auth and Nex application tables
- `backend/src/fixtures/` — safe demo catalog and XMLTV schedule
- `.github/workflows/epg-sync.yml` — free scheduled EPG fallback
- `docs/` — architecture, plan, and verification notes
- `NEX_SPEC_FREE_FIRST.md` — authoritative product specification

## Requirements

- Node.js 22 or newer
- Flutter stable with Dart 3
- Android Studio/Android SDK for Android builds
- Xcode on macOS for iOS builds
- A free Turso database for deployed mode
- Vercel CLI/account for deployment

The checked-out `.tooling/flutter` SDK used during initial verification is ignored and is not part of the repository.

## Environment

Copy `.env.example` to `.env` for local backend development. Never commit `.env`.

Required for a real deployment:

- `BETTER_AUTH_SECRET` — at least 32 random characters
- `BETTER_AUTH_URL` — deployed HTTPS API origin
- `NEX_INVITE_CODE` — private registration gate; never place it in the APK
- `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`
- `EPG_SYNC_SECRET` — bearer credential for the internal sync endpoint

Optional live integrations:

- `TMDB_READ_ACCESS_TOKEN`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` and `OPENAI_CHAT_MODEL`
- `EPG_XMLTV_URL` or `EPG_XMLTV_PATH`

`AI_DAILY_MESSAGE_LIMIT` protects OpenAI spend per authenticated user and UTC day. Catalog browsing, search, fixtures, and deterministic recommendation logic continue to work when AI is unavailable.

The Flutter app receives only the public backend URL:

```powershell
flutter run --dart-define=API_BASE_URL=https://your-nex-api.vercel.app
```

No server credential belongs in a Dart define, Flutter asset, or APK.

## Backend development

```powershell
npm install
npm run backend:migrate
npm run backend:dev
```

The API listens on `http://localhost:8787` by default. Verify it with `GET /api/health`. The response reports integration modes but never secrets.

Useful commands:

```powershell
npm run backend:check
npm --workspace backend run db:generate
npm --workspace backend run epg:sync
```

The local default database is `backend/local.db`, which is ignored. Migration `backend/drizzle/0000_perfect_hellfire_club.sql` creates Better Auth's `user`, `session`, `account`, and `verification` tables plus all Nex domain tables and indexes.

## Better Auth and mobile sessions

Better Auth owns password hashing, account/session records, expiry, logout, and deletion. Registration calls `/api/auth/sign-up/email` with the invite code; the Hono boundary validates the invite using a constant-time comparison and removes it before Better Auth sees the request.

The Better Auth bearer plugin returns `Set-Auth-Token` after successful signup/sign-in. Flutter stores that token in `flutter_secure_storage` and sends it over `Authorization: Bearer`. Logout and account deletion clear secure storage. Every private Nex route resolves its user from the Better Auth session; repositories include that user ID in ownership predicates.

Automated password-reset email is intentionally absent in private V1. Safe recovery is an operator-assisted reset: verify the friend out of band, remove their credential/account record through a restricted Turso admin session, and have them re-register with the private invite. Do not add an unauthenticated reset endpoint. A free SMTP flow can later be connected to Better Auth.

## TMDB

Create a TMDB Read Access Token for personal/non-commercial use and set `TMDB_READ_ACCESS_TOKEN`. Nex searches and caches encountered metadata only; it does not mirror TMDB. Metadata and availability have separate TTL variables. Exact lookup uses all providers in the user's country, while generic discovery prioritizes owned providers.

Images remain TMDB URLs and are never copied into Turso.

Required attribution is present in Settings:

> This product uses the TMDB API but is not endorsed or certified by TMDB.

Provider availability is identified as supplied by JustWatch through TMDB. Nex does not invent provider deep links.

## OpenAI

Set `OPENAI_API_KEY`; optionally change `OPENAI_MODEL` (simple extraction, currently gpt-5-mini) and `OPENAI_CHAT_MODEL` (richer preferences, contextual intent and composition, currently gpt-5). The backend uses the Responses API with strict Zod-backed structured outputs for onboarding taste extraction, intent parsing, grounded response composition, and spoiler-safe synopsis rewriting. Outputs are validated again before use.

OpenAI never supplies availability or an ungrounded title list. The deterministic pipeline retrieves and ranks candidates first, sends only a small grounded set for composition, and falls back safely when OpenAI is unavailable. OpenAI is the only expected usage-priced V1 service.

## Free XMLTV EPG

No paid EPG vendor or broadcaster scraping is built in. The tested global adapter uses iptv-org metadata and EPGShare01 schedules for Romania, Bulgaria, UK, Spain, France, Switzerland, Italy, Germany and limited Moldova coverage. Each user selects one country in Settings; ordinary EPG never mixes regions. Chat can answer another country only when explicitly asked. See [EPG source evaluation and setup](docs/EPG_SOURCES.md) for configuration and coverage limits. Single-source alternatives:

```text
EPG_SOURCE_TYPE=xmltv
EPG_XMLTV_URL=https://your-authorized-source.example/guide.xml
```

or for local development:

```text
EPG_SOURCE_TYPE=xmltv
EPG_XMLTV_PATH=C:\path\to\guide.xml
```

With `EPG_SOURCE_TYPE=fixture` (the default), Nex uses the realistic committed sample. The provider interface can be replaced without changing Browse, Chat, reminders, or queries.

`POST /api/internal/epg/sync` requires `Authorization: Bearer $EPG_SYNC_SECRET`. Sync normalizes XMLTV offsets to UTC, deduplicates channels/programs, records run status, and deletes data outside the configurable rolling window (seven past days and fourteen future days by default). Matching requires conservative title/evidence confidence; uncertain programs remain unmatched.

Scheduling options remain free:

1. The included GitHub Actions workflow imports directly into Turso daily. Configure repository secrets `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and optionally `TMDB_READ_ACCESS_TOKEN`.
2. Public repository variables `EPG_COUNTRIES` and `EPG_COUNTRY_SOURCES_JSON` select countries/feeds. Push and enable the workflow to activate scheduling.
3. `npm --workspace backend run epg:sync` is the manual fallback.

Only use an XMLTV source you are authorized to access. Nex does not redistribute feeds.

## Vercel deployment

Create a Vercel project with `backend` as its root directory, add the environment variables, then apply migrations and deploy:

```powershell
npm run backend:migrate
vercel --cwd backend --prod
```

The committed `backend/vercel.json` routes `/api/*` to the Hono function. Its 120-second duration requires Fluid Compute. EPG scheduling is separate through GitHub Actions; no Vercel cron is configured. Configure production secrets and deployed auth/web origins in Vercel.

After deployment:

1. call `https://your-host/api/health`;
2. exercise invite-gated signup/signin/logout;
3. call the protected EPG sync;
4. run Flutter with the deployed HTTPS `API_BASE_URL`;
5. verify Search, Browse, Chat actions, and a user-owned mutation.

## Flutter

```powershell
cd mobile
flutter pub get
flutter analyze
flutter test
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8787
```

`10.0.2.2` reaches the host from the Android emulator. A physical device needs a reachable HTTPS development URL or LAN host permitted by a development network-security configuration. Production must use HTTPS.

Android V1 requires notification permission for explicit TV reminders. The checked-in manifest declares Internet, notification, exact-alarm, and reboot permissions used by `flutter_local_notifications`. Configure a private release upload keystore before distributing an APK; the generated project uses debug signing locally.

The Flutter code is platform-neutral and includes iOS notification initialization. Building iOS still requires macOS/Xcode and normal Apple signing.

## Demo mode

Choose **Explore demo mode** on the sign-in screen. It includes a sample viewer, owned services, catalog, dynamic rows, TV schedule, editable taste, Chat blocks/actions, watchlist/history/reactions, Pick for me, and reminders. No credential or paid request is needed.

Demo data implements the same mobile state boundaries as live mode. Missing TMDB/OpenAI credentials select fixture/deterministic adapters. EPG fixtures require `EPG_SOURCE_TYPE=fixture`; live-source failure preserves valid cached data rather than silently switching to demo.

## Testing

See [the final verification report](docs/FINAL_VERIFICATION.md) for live user journeys, country isolation, native-device gaps and deployment status. Repeat live persona tests with `node --import tsx backend/scripts/user-journeys.ts` and regional tests with `node --import tsx backend/scripts/verify-countries.ts`; they use real configured services, incur OpenAI application usage and remove their temporary accounts.

Backend tests cover recommendation scoring, evidence weighting, exact-vs-discovery scope, owned providers, persistent-vs-session context, XMLTV timezones, EPG matching confidence, Chat reference resolution, reminder calculations, approved UI blocks, schema validation, and multi-user repository isolation.

Flutter tests cover launch/onboarding navigation and independent watchlist/history/Pick-for-me state.

Run all checks:

```powershell
npm run backend:check
cd mobile
flutter analyze
flutter test
```

## Free-first operating model

- Flutter application: free
- Vercel Hobby functions: free within private non-commercial limits
- Turso/libSQL: free tier
- Better Auth: open source
- TMDB: personal/non-commercial terms and attribution
- XMLTV: user-provided authorized feed, fixture fallback, free cron/manual sync
- Posters/backdrops: TMDB URLs; no paid storage
- TV reminders: local device notifications; no paid push provider
- OpenAI: only expected usage-based cost, with a server-enforced daily limit

If a free-tier limit becomes relevant, first reduce cache misses, payload sizes, EPG retention, and schedule frequency rather than adding paid infrastructure.

## Known V1 limitations and next steps

Seen library and opinion: Profile → Watched opens the seen library; use + to find titles, then mark seen and optionally select Like, Dislike, Meh or Super Like. Each is independently editable. Unrated seen titles supply only a small capped interest hint; explicit opinions override it. Ratings alone do not fabricate watched history. See [seen/opinion contract](docs/SEEN_FEEDBACK_PLAN.md) and [verification record](docs/SEEN_FEEDBACK_RESULTS.md). Apply all migrations before running the updated backend (`0004_seen_trait_hints.sql` is additive).

Extended verification and recommendation findings: [deep quality results](docs/DEEP_QUALITY_RESULTS.md), [personalization design](docs/PERSONALIZATION.md), and [native-device acceptance checklist](docs/DEVICE_ACCEPTANCE.md). Run real synthetic personas with `node --import tsx backend/scripts/deep-personas.ts`; add `--only=holdout` for the six held-out cases. These use configured application services and paid OpenAI calls, then remove their temporary accounts. For renderer screenshots, run `flutter test test/visual_review_test.dart` in `mobile` with `NEX_VISUAL_QA=1`. Drizzle Kit is shared root-level development tooling; dependency overrides and exact versions are intentional.

- No household profiles, Watch Together, full sports model, or recommendation spam.
- Provider APIs do not reliably expose per-title audio/subtitle tracks; Nex stores these as preferences, not availability claims.
- TMDB provider data does not provide universal direct playback links.
- Reminder reconciliation is structured for later EPG reschedule handling, but V1 schedules the explicit occurrence locally.
- Password-reset email awaits a configured free SMTP provider.
- Future work can add watchlist-availability notifications, licensed EPG providers, live events, and multi-viewer scoring without replacing current domain boundaries.
