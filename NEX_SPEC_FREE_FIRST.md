# NEX — MASTER BUILD SPEC FOR CODEX

You are the lead engineer and product designer for a new mobile application called **Nex**.

Build a complete, runnable MVP from scratch. Do not stop at scaffolding, wireframes, TODOs, placeholder architecture, or pseudocode. Implement the mobile app, deployed backend, database schema and migrations, authentication, API integrations, state management, navigation, reusable UI components, recommendation logic, AI flows, reminders, tests, deployment configuration, and setup documentation.

Make sensible product and engineering decisions yourself when something is unspecified. Do not repeatedly ask for clarification. Prefer a coherent working implementation over leaving decisions unresolved.

Before coding, create a concise implementation plan and architecture document inside the repository, then execute it fully.

---

# PROJECT IDENTITY

Product name: **Nex**

The user-facing application name is always **Nex**.

`Nex Hub` is only the longer application name used when registering for TMDB API credentials because TMDB did not accept the shorter name. It is NOT the product name and must never appear in the app UI, onboarding, branding, notifications, README product title, or normal user-facing copy.

App language for V1: **English**

Default market/country: **Romania**

Internal project slug: `nex`

The product is currently a private/personal project intended for myself and a small group of friends, not a commercial service.

Prioritize Android development and testing for V1 because the APK will initially be shared directly with friends. Keep the Flutter project fully iOS-compatible and avoid Android-only architectural decisions.

Keep the architecture capable of expanding later, but optimize V1 for simplicity, reliability, polish, low operating cost, and maintainability.

---

# PRODUCT

Build a premium mobile entertainment discovery app that combines:

- streaming availability
- Romanian TV schedules
- personalized movie/series recommendations
- natural-language AI discovery
- interactive AI responses
- watchlist
- watched history
- reactions/preferences
- TV reminders
- dynamic personalized Browse rows
- a "Pick for me" / Surprise Me experience

The experience should feel like a premium streaming application rather than a chatbot with a catalog attached.

The entire product should answer two simple user needs:

1. **Show me good things I can actually watch.**
2. **Understand what I want and give me real options.**

The product has ONLY TWO PRIMARY TABS:

1. Browse
2. Chat

Search and Profile/Settings are accessible from the top navigation and are NOT bottom navigation tabs.

Do not add unnecessary primary tabs such as Movies, TV, Discover, Sports, Watchlist, or AI.

---

# DESIGN PRINCIPLES

The UI must be:

- clean
- cinematic
- premium
- minimal
- modern
- highly polished
- spacious
- visually consistent
- not crowded
- not cheap-looking
- not overloaded with chips, buttons, badges, gradients, or text
- excellent in both dark and light mode

Avoid stereotypical "AI app" design.

Do not use excessive purple gradients, glowing effects, glassmorphism, giant AI branding, or emoji-heavy interfaces.

Use strong typography, large cinematic artwork, subtle motion, restrained use of accent color, generous spacing, and consistent poster cards.

Dark mode should feel especially premium.

The Chat screen must reuse the exact same movie/TV visual language and card components as Browse so it feels like a second way of controlling one product, not a bolted-on chatbot.

Implement responsive layouts suitable for modern iOS and Android phones.

---

# TECH STACK

## Mobile

Use:

- Flutter / Dart
- Material 3 as a base but heavily customized
- Riverpod for state management
- GoRouter for routing
- `flutter_secure_storage` for securely persisting the mobile auth/session token
- flutter_local_notifications for scheduled TV reminders

Authentication is handled by the Nex backend using Better Auth, backed by Turso.

## Backend

Use a deployable **TypeScript backend on Vercel**.

The backend must:

- run as Vercel serverless functions / a Vercel-compatible TypeScript API
- expose a clean JSON REST API for the Flutter client
- contain all secret-bearing integrations
- contain the recommendation engine
- contain AI orchestration
- contain database access
- contain EPG ingestion/matching logic
- enforce user authorization on every user-owned resource
- be deployable independently from the Flutter app

Use Zod or an equivalent runtime schema validator for API request/response validation.

Avoid an unnecessarily heavy full-stack web framework if it adds no value. A compact Vercel-compatible TypeScript API architecture is preferred.

## Database

Use **Turso / libSQL** as the main relational database.

Use:

- `@libsql/client`
- Drizzle ORM (preferred) or another small typed SQL layer if there is a concrete reason
- migration files committed to the repository
- indexes for time-window and user-scoped queries

The Flutter client must NEVER connect directly to Turso.

All Turso access goes through the Vercel backend.

## External APIs

Use:

- Better Auth on the Vercel backend for authentication
- OpenAI API for AI interpretation and conversational response composition
- TMDB API for movie/TV metadata and watch-provider availability
- configurable Romanian EPG provider abstraction

---

# REPOSITORY STRUCTURE

Use a clean monorepo layout similar to:

```text
nex/
├── mobile/              # Flutter application
├── backend/             # Vercel TypeScript API
├── docs/                # architecture/implementation notes
├── SPEC.md              # this specification
├── .env.example
└── README.md
```

Exact internal structure can vary if there is a strong engineering reason, but keep mobile and backend clearly separated.

Configure Vercel so the `backend` directory is deployable as the backend project/root.

---

# DEVELOPMENT CREDENTIALS

A local `.env` file may already exist in the repository workspace.

It may contain real development credentials required to test integrations end-to-end.

Potential variables include:

```text
TMDB_READ_ACCESS_TOKEN=
OPENAI_API_KEY=
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=
NEX_INVITE_CODE=
VERCEL_TOKEN=
VERCEL_ORG_ID=
VERCEL_PROJECT_ID=
EPG_SYNC_SECRET=
EPG_SOURCE_TYPE=xmltv
EPG_XMLTV_URL=
EPG_XMLTV_PATH=
EPG_RETENTION_PAST_DAYS=7
EPG_RETENTION_FUTURE_DAYS=14
API_BASE_URL=
OPENAI_MODEL=
AI_DAILY_MESSAGE_LIMIT=
```

Rules:

- Read environment variables as needed for implementation and testing.
- NEVER print secret values to terminal output or logs.
- NEVER include actual secret values in generated files, source code, screenshots, README files, tests, or responses.
- NEVER commit `.env`.
- Ensure `.env` is in `.gitignore`.
- Create and maintain `.env.example` containing variable names and safe placeholders only.
- Do not embed `OPENAI_API_KEY`, `TURSO_AUTH_TOKEN`, `BETTER_AUTH_SECRET`, TMDB private credentials, Vercel credentials, EPG sync secrets, invite codes, or other backend secrets in the Flutter app.
- The Flutter app should only know the public Nex API base URL plus non-secret client configuration.
- Authentication is performed against the Nex backend. The Flutter app must store the returned session/bearer token using secure OS-backed storage, not plain SharedPreferences.
- The backend must read its sensitive environment variables from Vercel environment variables in production.

Do not stop and ask for API keys if a credential is missing.

If a credential is unavailable:

1. create the correct environment variable and integration point,
2. implement the real integration,
3. keep demo/fixture mode available,
4. document the exact credential/setup needed,
5. continue implementing the rest of the application.

If credentials ARE available, use them and test real integrations end-to-end.

Never substitute fake architecture merely because credentials are temporarily unavailable.

---

# DEPLOYMENT

The backend must be deployable to **Vercel**.

Create all required Vercel configuration.

If Vercel credentials are available in the environment, deploy the backend during the build and use the deployed URL for end-to-end testing.

If automatic deployment is not possible because authentication is unavailable, leave the backend fully deployment-ready and document the exact one-command or minimal deployment process.

Do not require a permanent VPS or always-on server.

The deployed backend must support HTTPS and the Flutter app must be configurable to call it through `API_BASE_URL`.

Create a lightweight `/api/health` endpoint for deployment/integration checks.

---

# FREE-FIRST INFRASTRUCTURE — HARD REQUIREMENT

Except for OpenAI API usage, the V1 architecture must be able to run on free tiers for a small private group of users.

This is a hard product/architecture requirement, not merely a preference.

Target cost model:

- Flutter mobile app: free
- Vercel Hobby/serverless backend: free for this personal/private non-commercial project within plan limits
- Turso/libSQL database: free tier
- Better Auth: open-source library, no separate auth service fee
- TMDB: non-commercial/personal API usage with required attribution
- Romanian EPG infrastructure: free; do not select a paid EPG vendor for V1
- local device reminders: free
- images/posters: use TMDB image URLs rather than paid storage/CDN
- OpenAI API: the only expected usage-based paid service

Engineering rules:

- Do not add a paid SaaS, database, queue, scheduler, push provider, storage service, analytics service, CDN, or EPG vendor merely because it is convenient.
- Do not require a credit-card-only paid plan for a core V1 feature if a free architecture can implement it.
- If a free-tier limit becomes relevant, first optimize requests, caching, retention, payload size, and scheduling before proposing a paid upgrade.
- Do not silently enable a paid plan or paid add-on.
- Keep all infrastructure replaceable so a free provider can be swapped later if its limits change.
- Protect OpenAI endpoints with authentication and a configurable per-user usage limit so one friend or leaked account cannot accidentally create large AI costs.
- A configurable `AI_DAILY_MESSAGE_LIMIT` or equivalent should be enforced server-side.

Do not store TMDB images in Turso or duplicate large external media assets.

Use TMDB image URLs directly according to their API conventions.

Use local device notifications for explicit TV reminders.

Do not add paid push-notification infrastructure for V1.

---

# AUTHENTICATION

Use **Better Auth** inside the Vercel TypeScript backend, backed by the same Turso/libSQL database used by Nex.

Do NOT build password/session cryptography manually.

Use Better Auth with the Drizzle SQLite adapter (or another officially supported Better Auth adapter compatible with the chosen Turso/Drizzle setup).

Support at least:

- email/password account creation
- email/password login
- authenticated session validation
- logout
- account deletion

Because Flutter is a native mobile client, configure a secure API-friendly session mechanism. Prefer Better Auth's Bearer-token support for authenticated API requests rather than relying exclusively on browser cookies.

The Flutter app must:

- authenticate only against the Nex backend
- receive/store the auth session token securely
- use `flutter_secure_storage` or equivalent OS-backed secure storage
- send the token only over HTTPS
- clear local auth state on logout/account deletion

The backend must:

- validate the Better Auth session/token on every private request
- derive the current user ID from the authenticated session
- never trust a client-provided `user_id` when the session already identifies the user
- enforce ownership checks on all user-owned Turso queries

Do NOT implement household profiles. Each person gets their own Nex account.

Because Nex is private and OpenAI calls can cost money, registration should be gated in V1.

Implement a simple backend-controlled invite mechanism, for example a configurable `NEX_INVITE_CODE` checked at registration, or an equivalent invite/allowlist mechanism. Do not embed the invite code in the APK.

Email verification and automated password-reset email are NOT required for the first private V1 if they would introduce another paid/fragile dependency. Architect Better Auth so a free SMTP/email provider can be added later without rewriting authentication.

If password reset email is not configured, document a safe private-project recovery/admin reset procedure rather than implementing insecure reset behavior.

Add security tests proving that one authenticated user cannot read or modify another user's watchlist, taste profile, reminders, conversations, settings, or other private rows.

---

# DATA PROVIDERS

## TMDB

Use TMDB for:

- movies
- series
- posters/backdrops
- synopsis
- cast
- crew
- genres
- keywords where appropriate
- ratings
- runtime
- search
- discover queries
- recommendations/similar titles where useful
- streaming/watch-provider availability by country

Respect provider region.

Default initial region is Romania but country must be user-configurable.

Do not mirror the entire TMDB database.

Fetch/cache only data needed by the app.

Keep TMDB integration behind a repository/service abstraction.

Use the TMDB Read Access Token server-side through the Nex backend.

Do not expose it in Flutter unless there is an unavoidable documented reason; the preferred architecture is server-side TMDB access.

Implement reasonable caching for encountered metadata and provider availability.

Metadata can be cached longer than rapidly changing availability data.

Make cache TTLs configurable and do not retain stale provider availability indefinitely.

Add TMDB attribution in an About/Credits area:

"This product uses the TMDB API but is not endorsed or certified by TMDB."

Where watch-provider data requires JustWatch attribution, include appropriate attribution in the About/Credits area.

Do not invent direct streaming deep links if TMDB does not provide them.

## Romanian EPG

EPG is a core Nex feature and must be implemented with the **free-first/private-project constraint** in mind.

Do NOT select or depend on a paid EPG vendor for V1.

Do NOT hardcode or redistribute an unlicensed third-party feed.

Do NOT build automated scraping of broadcaster websites as the default production architecture.

Create a modular `EpgProvider` abstraction so the source can be replaced later without changing Browse, Chat, recommendations, reminders, or database queries.

V1 must support:

- a user-provided/configurable XMLTV URL through `EPG_XMLTV_URL`
- a local XMLTV file through `EPG_XMLTV_PATH` for development
- realistic fixture/sample EPG data for demo mode
- normalized storage in Turso
- provider/source metadata so multiple source implementations can be added later

The app should work even when no live EPG URL is configured: streaming discovery continues to work and demo/fixture TV data remains available in development/demo mode.

### EPG sync strategy

Create a protected backend sync endpoint such as:

```text
POST /api/internal/epg/sync
```

Protect it with `EPG_SYNC_SECRET` or an equivalent server-side mechanism.

The synchronization architecture must not require a paid scheduler.

Use this priority:

1. Vercel Cron if the current free/Hobby plan supports a sufficient schedule.
2. Otherwise include a scheduled GitHub Actions workflow (or another genuinely free scheduler) that calls the protected sync endpoint.
3. Always keep a manual/private sync command or endpoint for development and fallback.

Do not make the mobile app itself download and parse the entire XMLTV feed on every launch.

The backend should ingest, normalize, deduplicate, and upsert schedule rows.

Track sync metadata such as:

- source/provider
- last successful sync
- source timestamp when available
- imported row count
- error status

Use a rolling retention window by default:

- `EPG_RETENTION_PAST_DAYS=7`
- `EPG_RETENTION_FUTURE_DAYS=14`

Make these configurable.

Delete stale historical rows and avoid keeping years of EPG history just because storage is available.

### EPG normalization

Normalize at least:

- channel ID
- channel display name
- channel logo URL when available
- program title
- subtitle/episode title when available
- description
- start time
- end time
- category/type
- source language when available
- source/provider identifier

Store all times in UTC internally and render in the user's selected/local timezone.

Handle XMLTV timezone offsets correctly.

### EPG → TMDB matching

Create a matching pipeline that attempts to associate eligible movies/series from EPG with TMDB titles.

Use signals such as:

- normalized title
- Romanian/localized title
- original title
- year
- description
- runtime/duration
- cast/people when present
- category/type
- other available metadata

Generate a matching confidence score.

Do not blindly associate low-confidence matches.

Keep uncertain matches unmatched rather than displaying incorrect metadata.

Cache successful stable matches so the same program/title does not require repeated expensive matching work.

The EPG provider implementation must remain replaceable later if a better free/private source or licensed source becomes available.

---

# CORE NAVIGATION

Bottom navigation:

```text
BROWSE | CHAT
```

Top area:

- Search icon
- Profile/avatar

No other primary tabs.

Profile opens Watchlist, Watched, Your Taste, Settings, and account actions.

---

# ONBOARDING

Create a polished multi-step onboarding.

Do not make it feel like filling out a form.

Use attractive full-screen steps.

## Step 1 — Country

Ask:

"Where do you watch from?"

Default suggestion:

Romania

Country affects streaming availability and TV schedule.

It can later be changed from Settings.

## Step 2 — Streaming services

Ask which services the user currently has.

Display provider logos/cards.

Examples in Romania may include:

- Netflix
- Max
- Disney+
- Prime Video
- SkyShowtime
- others returned by provider data

Persist selected TMDB provider IDs / normalized service IDs.

Selections can later be changed from Settings.

## Step 3 — Language preferences

Ask how the user watches content.

Store independently:

- preferred audio languages
- preferred subtitle languages
- preference for original audio

Allow multiple subtitle languages.

Examples:

Audio:
- Original language
- Romanian
- English
- Other

Subtitles:
- Romanian
- English
- None
- Other

These are user preferences, not claims that every provider exposes reliable per-title audio/subtitle data.

## Step 4 — Five favorites

Ask:

"Give us up to 5 movies or shows you love."

Use real TMDB search/autocomplete with posters when credentials/network are available.

Store selected TMDB IDs and media types.

Use these titles to bootstrap taste modeling.

## Step 5 — Free-text taste description

Ask:

"Tell us what makes a movie or show good for you."

Example placeholder:

"I like complicated stories, sci-fi, mysteries and plot twists. Slow is fine if the story is good. I dislike musicals and heavy gore."

Send this text plus selected favorite titles to an AI analysis endpoint.

The AI must return structured taste data rather than prose only.

## Step 6 — Genres / moods

Let the user select favorite genres.

Also allow mood/style preferences such as:

- Cerebral
- Tense
- Dark
- Feel-good
- Cozy
- Funny
- Emotional
- Intense
- Weird
- Fast-paced
- Slow-burn

Keep visual density low.

Do not force the user to select many.

## Completion

Generate the initial taste profile and immediately enter a personalized Browse experience.

The user must receive useful recommendations from the first session rather than waiting weeks for personalization.

---

# TASTE MODEL

Create a persistent taste representation.

It must NOT simply contain favorite genres.

Model dimensions such as:

- genres
- themes/keywords
- moods
- pacing
- storytelling characteristics
- actors
- directors
- languages
- dislikes
- selected favorites

Each preference signal should support:

- score
- confidence
- evidence count
- last updated
- evidence/source

Example conceptual preference:

```json
{
  "dimension": "mood",
  "key": "cerebral",
  "score": 0.91,
  "confidence": 0.82,
  "evidence_count": 8
}
```

Do not assume five onboarding answers perfectly define the user.

Taste must evolve.

Confidence should prevent a few weak interactions from permanently defining the user.

---

# USER FEEDBACK / TASTE SIGNALS

Titles support:

- Super Like
- Like
- Meh
- Dislike
- Watched
- Watchlist

Treat signals differently.

Conceptual strength:

- Super Like = very strong positive
- Like = strong positive
- Meh = weak/neutral
- Dislike = strong negative
- Watchlist = medium positive intent
- Watched = useful history but not automatically positive
- explicit long-term preference in Chat = strong/very strong
- search = very weak
- opening title details = very weak

A single search must never cause a major preference change.

Repeated behavior can gradually influence preferences.

Searching for a title does NOT imply the user likes that title.

Explicit user statements and reactions should outweigh inferred behavior.

Store user events separately from derived taste preferences so the taste model can be recalculated/refined later.

---

# LONG-TERM MOOD VS CURRENT MOOD

This distinction is critical.

The user's long-term taste may show that they generally like:

- dark
- cerebral
- tense
- feel-good
- cozy
- intense
- etc.

These are persistent taste dimensions.

Current/session mood is temporary.

Example:

"Tonight I want something light."

This should influence current recommendations but must NOT permanently rewrite the user as someone who prefers light movies.

Model separately:

- persistent taste
- temporary session context

Session context may contain:

- desired mood
- available time
- temporary exclusions
- provider constraint
- content type
- "easy to follow"
- "not depressing"
- "with family tonight"
- other clearly temporary constraints

Session context should expire/reset sensibly and must not silently become permanent preference data.

If the user says:

"I generally hate musicals."

That IS a persistent preference.

If the user says:

"I don't want musicals tonight."

That is temporary.

---

# BROWSE TAB

The Browse tab is Netflix-like but represents the user's entire entertainment universe rather than one provider's catalog.

Include:

- a premium hero area
- horizontal poster/content rows
- Live TV rows
- dynamic personalized rows
- Surprise Me / Pick for me entry point

Some rows are stable; others should be generated dynamically based on:

- user taste
- current availability
- selected streaming services
- EPG schedule
- current time
- session context
- watchlist
- watched history

Potential rows:

- Live Now on TV
- Starting Soon on TV
- Tonight on TV
- Top Picks for You
- Great on Your Services
- New on Your Services
- From Your Watchlist — Available Now
- Under 90 Minutes
- Under 2 Hours
- Because You Super-Liked [Title]
- Dark & Cerebral — Your Kind of Thing
- Feel-Good Picks
- Great Thrillers Tonight
- Movies on TV You Might Like
- Continue Exploring [theme]
- On TV Tonight from Your Watchlist

Do NOT render every possible row simultaneously.

Create a `HomeRowGenerator` / recommendation orchestration layer that chooses a compact, high-quality subset based on relevance and available results.

Rows should feel genuinely personalized and may change between sessions.

The recommendation engine/backend determines actual candidate IDs.

The LLM must not hallucinate catalog items.

AI may generate/refine a friendly row title only after the backend has selected a grounded candidate set.

---

# CARD DESIGN

Cards should remain minimal.

Default movie/series card should primarily show:

- poster
- title
- runtime/rating when useful
- small provider/channel availability indicator

Do not place six action buttons under every card.

Use long press or overflow menu for quick actions:

- Super Like
- Like
- Meh
- Dislike
- Add/remove Watchlist
- Mark Watched
- Remind Me when relevant

Tap opens the universal title page.

Availability information must be visually understandable at a glance without overcrowding the card.

---

# AVAILABILITY IS FIRST CLASS

Every relevant title should make it easy to answer:

"Can I watch this?"

Model at least these states:

1. Included on one of MY selected services
2. Available through accessible TV
3. Available but requires extra payment/rent/buy
4. Available on a service I do NOT currently have

Generic recommendations should strongly prioritize content already included in services the user owns or accessible TV.

Exact title lookup/search must show availability across ALL known providers in the selected country, even if the user does not subscribe to them.

Clearly distinguish:

- "Included"
- "Rent/Buy"
- "Subscription required / You don't have this service"

Never pretend the user owns a provider they did not select.

---

# OWNED SERVICES VS ALL PROVIDERS

Implement explicit intent/scoping rules.

For generic discovery/recommendation requests:

- "What should I watch?"
- "Give me a thriller."
- "Anything good tonight?"

Default:

```text
availability_scope = owned_services
```

Prioritize:

1. included subscriptions the user selected
2. accessible TV
3. optionally other availability only if useful or explicitly requested

For exact lookup:

- "Interstellar"
- "Where can I watch Oppenheimer?"

Use:

```text
availability_scope = all_providers
```

Show every known availability source in the selected country and visually indicate services the user does not currently have.

The user may explicitly override:

"Show me anything, even outside my subscriptions."

---

# GLOBAL SEARCH

Search icon on Browse.

Search must support:

- exact movie/series search
- people when useful
- availability lookup
- natural-language discovery queries

Examples:

- Interstellar
- Batman
- good horror on Netflix under 2 hours
- where can I watch Oppenheimer
- funny movie under 90 minutes

Use intent detection to determine whether the request is:

- TITLE_LOOKUP
- DISCOVERY
- PERSON_LOOKUP
- AVAILABILITY_LOOKUP

Exact search should NOT be interpreted as a positive preference signal.

Natural-language discovery can use the same FilterQuery pipeline as Chat.

---

# UNIVERSAL TITLE DETAIL PAGE

The same detail page opens regardless of whether the title came from:

- Browse
- Chat
- Search
- Watchlist
- TV
- recommendations

Display cleanly:

- backdrop
- poster where appropriate
- title
- year
- runtime
- genres
- rating
- spoiler-safe synopsis
- cast
- director/crew
- streaming availability
- TV availability
- Watchlist
- Watched
- reaction
- similar/recommended titles

Create a section:

## WHY THIS

Explain recommendations using actual stored evidence.

Example:

"Because you super-liked Arrival and often enjoy cerebral science fiction."

Do not display fake precision such as "97% match" unless backed by a real calibrated metric.

## WATCH NOW

Show:

1. owned/included services
2. accessible TV if appropriate
3. rent/buy
4. services the user does not own

Clearly distinguish categories.

## ON TV

Show upcoming TV occurrences and allow reminders.

---

# SPOILER-SAFE DESCRIPTION

Default synopsis should preserve premise, tone, and enough context to be useful while avoiding major spoilers.

AI may rewrite trusted source metadata into approximately 2–4 concise sentences.

Do NOT reveal:

- twists
- deaths
- ending
- hidden identities
- late-story villains
- major later-story developments

Never invent plot details.

Provide an optional way to reveal/read the source/full synopsis.

Do not reduce the default description to useless 2–3 word tags.

---

# CHAT TAB

This is NOT a text-only chatbot.

The AI returns structured UI blocks rendered by Flutter.

Possible blocks:

- text
- movie_card
- movie_carousel
- tv_carousel
- availability_block
- quick_actions
- comparison
- confirmation
- empty_state

Define a typed JSON schema shared conceptually between backend and Flutter.

Example:

```json
{
  "blocks": [
    {
      "type": "text",
      "content": "These are the three I'd start with."
    },
    {
      "type": "movie_carousel",
      "movieIds": [123, 456, 789]
    },
    {
      "type": "quick_actions",
      "actions": [
        "More psychological",
        "Under 90 minutes",
        "Something lighter"
      ]
    }
  ]
}
```

Never allow the LLM to render arbitrary Flutter widgets.

Flutter only renders approved block/component types.

---

# CHAT CAPABILITIES

The AI should understand requests such as:

- "I have 1 hour 45 minutes and want something tense on Max."
- "Give me something funny but not stupid."
- "What's good on TV tonight?"
- "I don't want anything depressing tonight."
- "Where can I watch Interstellar?"
- "Anything good even if I don't subscribe to the service?"
- "I'm tired, give me something easy to follow."
- "Something like Arrival but less slow."

The AI converts natural language to structured intent/filter/context data.

The LLM must NOT attempt to choose from every movie in existence from memory.

Architecture:

```text
user message
-> AI intent/parser
-> structured FilterQuery
-> backend candidate retrieval from TMDB + EPG + user data
-> hard filtering
-> deterministic/personalized ranking
-> small candidate set
-> AI response composer
-> structured UI blocks
```

Do not use RAG as the primary movie-catalog search mechanism for V1.

---

# HARD VS SOFT FILTERS

Represent separately.

Hard constraints:

- runtime
- country
- content type
- provider
- availability scope
- time window
- already watched exclusion
- TV start/end constraints
- explicit language constraints where supported

Soft preferences:

- mood
- tone
- similarity
- complexity
- pacing
- themes
- "not depressing"
- "mind-bending"
- "easy to follow"
- "something unusual"

Database/API filtering handles hard constraints.

The recommendation engine handles taste and soft preference scoring.

AI interprets ambiguous natural language and explains final results.

---

# CHAT ACTIONS

The Chat system must be able to request approved application actions.

Create safe backend/client action handlers such as:

- searchCatalog
- recommend
- getAvailability
- getTvSchedule
- addToWatchlist
- removeFromWatchlist
- markWatched
- rateTitle
- setReminder
- cancelReminder
- updateTastePreference
- setSessionContext

Examples:

User:
"Add the first and third to my watchlist."

Perform the actions and return confirmation.

User:
"Remind me about the second one."

Resolve the card reference, schedule a local reminder, and confirm it.

User:
"I hated that."

If the referenced title is unambiguous, mark it as Dislike and update taste evidence.

User:
"For tonight I don't want anything heavy."

Set TEMPORARY session context.

User:
"I generally hate musicals."

Update PERSISTENT taste.

All state-changing backend actions must be authenticated and authorized.

---

# CHAT MEMORY / REFERENCE RESOLUTION

Conversation state must preserve references to recently displayed movie/TV IDs.

The phrase:

"the second one"

must resolve to the appropriate recent carousel item.

Do not rely on the LLM remembering movie identities implicitly.

Persist structured conversation/display context.

Store message metadata necessary for this behavior without duplicating huge external payloads.

---

# RECOMMENDATION ENGINE

Implement an initial deterministic/rule-based recommendation system.

Do not build custom ML for V1.

Candidate retrieval first.

Then scoring.

Potential scoring signals:

- long-term taste similarity
- explicit genre preference
- theme/keyword preference
- mood preference
- director/actor affinity
- availability on owned services
- TV timing/context
- current session context
- quality/rating
- popularity as a weak fallback
- novelty
- watched exclusion
- negative preferences
- watchlist relevance

Use configurable weights.

Make scoring modular and testable.

Store explanation/evidence with recommendation results so the UI can show "Why this?"

Do not have the AI invent why a movie was recommended.

The recommendation pipeline should support a future request shape such as:

```json
{
  "viewerIds": ["current-user-id"]
}
```

Do NOT implement Watch Together now.

Do not architect the recommendation engine in a way that makes future multi-user requests impossible.

Later it should be possible to request:

```json
{
  "viewerIds": ["userA", "userB"]
}
```

without a total rewrite.

---

# SURPRISE ME / PICK FOR ME

Add a polished "Pick for me" entry point on Browse.

Not a separate tab.

Use a bottom sheet or equally elegant compact interaction.

Possible controls:

Time:
- Under 90m
- Around 2h
- Doesn't matter

Mood:
- Use my taste
- Light
- Intense
- Funny
- Surprise me

Return ONE primary recommendation, not a huge list.

Show:

- poster
- concise reason
- availability
- details/open action

Actions:

- Perfect
- Another one

"Another one" must avoid repeating rejected candidates in that session.

---

# WATCHLIST

Watchlist exists in Profile.

Also use it intelligently throughout Browse.

Possible rows:

- From Your Watchlist — Available Now
- On TV Tonight from Your Watchlist
- Short Movies from Your Watchlist

Do not treat the Watchlist as merely a static graveyard.

---

# TV / LIVE

TV should appear naturally inside Browse and Chat.

No separate TV tab.

Support:

- Live Now
- Starting Soon
- Tonight
- Tomorrow/upcoming where appropriate

TV program records should contain:

- channel
- start time
- end time
- program title
- description
- type/category when available
- matched TMDB ID if confidently matched

TV cards should display:

- channel
- LIVE / start time
- end time where useful

---

# REMINDERS

Use local device notifications for V1.

Allow user to schedule:

- at start
- 5 minutes before
- 10 minutes before
- custom offset if easy to support

Persist reminder records in Turso for cross-session/account consistency.

Schedule the actual notification locally using `flutter_local_notifications`.

If EPG schedule data changes, architect reminder code so reconciliation can later be implemented.

Do not build paid push infrastructure for V1.

---

# NOTIFICATIONS

Do not spam.

For V1, implement only explicit user-created reminders.

Architect an optional future notification category:

- a Watchlist title becomes newly available on a selected service

Do not enable generic recommendation spam.

No "We miss you" notifications.

---

# PROFILE

Profile screen should contain:

- Watchlist
- Watched
- Your Taste
- Settings
- Account

No separate bottom tab.

Do not implement household profiles.

---

# YOUR TASTE SCREEN

Make personalization understandable.

Display tasteful summaries such as:

You tend to love:
- Cerebral
- Science fiction
- Mysteries
- Dark comedy

You often enjoy:
- Complex stories
- Plot twists
- Slow burns

Usually not your thing:
- Musicals
- Heavy gore

Allow editing/correction.

Do not expose ugly internal numeric scores by default.

Provide "Edit preferences".

If the user corrects the taste profile, treat that as strong explicit evidence.

---

# SETTINGS

Keep Settings minimal and well organized.

## Watching

- Country
- Streaming services
- TV preferences/favorite channels if implemented
- Audio language preferences
- Subtitle language preferences

## Your Taste

- genres
- moods
- dislikes
- reset personalization

## Notifications

- TV reminders
- future placeholder for watchlist availability notifications if desired

## Appearance

- System
- Light
- Dark

## Privacy

- whether search/chat behavior may influence recommendations
- data controls

## Account

- email/account information
- sign out
- delete account

Country and streaming platform selections must be editable here.

---

# DATABASE — TURSO

Create migrations/schema for at least:

Better Auth's required authentication tables (generated according to the installed Better Auth version), including the equivalent of:

- user
- session
- account
- verification

Nex application tables:

- profiles
- user_streaming_services
- user_language_preferences
- user_taste_preferences
- user_title_feedback
- watchlist
- watch_history
- channels
- epg_programs
- epg_tmdb_matches
- epg_sync_runs or equivalent sync metadata table
- reminders
- conversation_sessions
- conversation_messages
- conversation_displayed_items
- user_events
- session_context
- tmdb_cache or equivalent lightweight metadata cache

Use proper foreign keys where supported/appropriate, indexes, unique constraints, and timestamps.

Important indexes should cover patterns such as:

- auth session/token lookup
- unique user email/account lookup
- user-scoped lookups
- EPG by channel/time
- EPG by time range
- TMDB match lookup
- active reminders
- recent conversation display references
- cache expiry

Do not store unnecessary copies of TMDB data.

Do not store image binaries.

Do not mirror TMDB's whole catalog.

A lightweight cache of encountered title metadata is acceptable.

Keep large or frequently changing provider availability data fresh.

---

# BACKEND API

Design a clear API surface.

Exact routes may vary, but support equivalent capabilities such as:

```text
GET  /api/health

Better Auth routes under /api/auth/* (or the equivalent Vercel-compatible mount)

GET  /api/search
GET  /api/title/:mediaType/:tmdbId
GET  /api/providers
GET  /api/tv/live
GET  /api/tv/upcoming

POST /api/recommend
POST /api/surprise
POST /api/onboarding/analyze
POST /api/chat

GET/POST/DELETE endpoints for:
- watchlist
- watched history
- reactions/feedback
- taste/preferences
- settings
- reminders
- conversation state

POST /api/internal/epg/sync
```

Do not mechanically expose raw tables.

Use domain-oriented endpoints.

Validate all input.

Normalize error responses.

Protect all private endpoints with authentication.

Protect internal ingestion/cron endpoints separately.

---

# OPENAI INTEGRATION

Create backend AI functions for:

1. onboarding taste extraction
2. chat intent / FilterQuery extraction
3. response composition into approved UI blocks
4. spoiler-safe synopsis rewriting when needed

Use structured outputs / strict JSON schemas where supported.

Validate every model response before using it.

Never blindly trust model output.

Make model selection configurable through `OPENAI_MODEL`.

Do not hardcode an obsolete model name throughout the codebase.

The model should not be used to invent catalog availability or determine facts that TMDB/EPG/backend data can provide.

The model receives a small grounded candidate set for final explanation/composition.

---

# DATA LAYER / ABSTRACTIONS

Use clear repository/service interfaces.

Examples:

- TmdbRepository
- EpgRepository
- UserRepository
- RecommendationRepository
- ChatRepository
- ReminderRepository
- AuthService
- TursoDatabase

External services must not leak directly into Flutter widgets.

Backend route handlers should not contain large blocks of raw SQL or business logic.

Keep integration boundaries replaceable.

---

# FUTURE SPORTS SUPPORT

Do NOT build full sports support now.

However, avoid modeling all discoverable content as strictly Movie.

Create an extensible conceptual content model where future live events can fit.

For example:

```text
ContentType:
movie
series
episode
liveEvent
```

Only implement current movie/series/TV requirements fully.

A future `liveEvent` might represent a football match, Formula 1 race, etc.

Do not let this future-proofing overcomplicate V1.

---

# ERROR HANDLING

Handle:

- network unavailable
- backend unavailable
- Vercel API error
- Turso unavailable
- TMDB unavailable
- EPG unavailable
- AI unavailable
- invalid AI structured response
- expired/invalid auth
- missing poster
- missing runtime
- no provider availability
- no TV match
- empty results
- reminder permission denied

The app should degrade gracefully.

If AI fails, normal Browse/Search must still function.

If EPG fails, streaming discovery must still function.

If TMDB fails, show a clear recoverable state instead of crashing.

---

# DEMO MODE

Keep demo mode even though real credentials are expected for the one-shot build.

If API credentials are missing, the app must still be demonstrable using local fixtures.

Include:

- sample user
- sample selected streaming services
- sample movies
- sample TV schedule
- sample taste profile
- sample Chat conversations/responses

The full navigation and major flows should be usable in demo mode.

When real credentials exist, prefer live integrations for end-to-end testing.

---

# SECURITY

Never expose:

- OpenAI API key
- Turso auth token
- Better Auth secret
- Nex invite code
- TMDB private token
- Vercel credentials
- EPG/internal sync secret
- other backend secrets

The Flutter APK must not contain backend secrets.

Validate Better Auth authentication on all private backend operations.

Enforce ownership checks at the backend/repository layer.

Protect registration with the private invite mechanism.

Rate-limit or otherwise protect expensive/abusable AI endpoints sensibly.

Enforce the configured per-user AI usage limit server-side.

Validate external API data before persistence.

Do not log full sensitive request bodies unnecessarily.

Do not log secrets.

---

# ACCESSIBILITY

Support:

- dynamic text reasonably
- semantic labels
- sufficient contrast
- large touch targets
- screen-reader-friendly controls

---

# PERFORMANCE

Use:

- pagination
- image caching
- lazy horizontal lists
- debounced search
- request cancellation when appropriate
- server-side caching
- database indexes
- lightweight JSON payloads

Do not download huge datasets to the mobile client.

Do not send hundreds of candidate movies to the LLM.

Candidate retrieval and ranking happen before AI response composition.

---

# TESTING

Create unit tests for important logic including:

- recommendation scoring
- taste signal weighting
- search intent scoping
- owned-services vs all-providers behavior
- persistent vs temporary preferences
- EPG/TMDB matching normalization
- chat carousel reference resolution
- reminder scheduling calculations
- authorization/user ownership isolation
- Turso repository logic where practical
- API schema validation

Add Flutter widget tests for key navigation/screens where practical.

Add backend tests for core API/service behavior.

Run:

```text
flutter analyze
flutter test
```

and the appropriate backend test/typecheck/lint commands.

Fix resulting errors.

---

# CODE QUALITY

Use a clear feature-first or domain-oriented folder structure.

Avoid gigantic files.

Avoid business logic in Flutter widgets.

Avoid huge route handlers.

Use typed models.

Use immutable data where sensible.

Keep external integrations replaceable.

Add useful comments only where necessary.

Do not create an enormous generated abstraction hierarchy.

Prefer understandable production-style code over cleverness.

---

# README

Create a comprehensive README with:

- product overview
- architecture diagram/text
- repository layout
- setup
- Flutter requirements
- Vercel backend setup
- Turso database setup
- migrations
- Better Auth + Turso authentication setup
- TMDB credentials
- OpenAI credentials
- XMLTV/EPG configuration, sync strategy, retention, and free scheduler options
- environment variables
- local development
- backend deployment
- Android build/run
- iOS compatibility notes
- demo mode
- testing
- known limitations
- next steps
- attribution/credits requirements

Do not include real credentials.

---

# VISUAL QUALITY BAR

Do not treat visual design as an afterthought.

Spend real implementation effort on:

- typography hierarchy
- poster proportions
- cinematic backdrop treatment
- gradients only where needed for text readability
- spacing
- skeleton loading states
- polished empty states
- smooth page transitions
- tasteful bottom sheets
- coherent iconography
- provider badges
- TV status badges
- dark/light themes

The Browse and Title Detail screens should look credible as screens from a real premium consumer entertainment app.

Chat must feel equally polished and reuse the same content components.

Do not fill empty space with unnecessary labels or controls.

---

# IMPORTANT PRODUCT RULES

1. The user-facing product name is **Nex**.
2. Browse prioritizes content available on services the user owns.
3. Exact title lookup searches all providers in the user's country.
4. Search alone is not evidence that a user likes something.
5. Explicit feedback strongly affects taste.
6. Persistent taste and current mood/context are separate.
7. Long-term mood preference can be part of taste; temporary mood is session context.
8. AI never invents movie availability.
9. AI never chooses titles solely from its own world knowledge when catalog APIs can provide them.
10. Availability is determined by trusted application data.
11. Recommendation explanations must be grounded in stored evidence.
12. Chat can perform approved application actions.
13. Browse and Chat share one personalization/recommendation system.
14. Chat changes to persistent preferences should visibly affect Browse later.
15. Temporary context should affect current recommendations but expire/reset appropriately.
16. Do not add extra primary navigation tabs.
17. Keep the UI elegant and sparse.
18. No household profiles in V1.
19. Watch Together is NOT implemented now, but future multi-viewer recommendation architecture should remain possible.
20. Sports are NOT implemented now, but the content model should not make future live events impossible.
21. Notifications in V1 are explicit reminders only.
22. Availability must be visible without making cards visually cluttered.
23. Exact search may show titles on services the user does not own; recommendations should primarily use owned services/TV.
24. The Flutter app never talks directly to Turso.
25. Secrets live only in the backend/Vercel environment.
26. Nex V1 must be operable on free infrastructure tiers except for OpenAI usage.
27. Do not introduce a paid EPG provider in V1.
28. EPG must support user-configured XMLTV input, free scheduling/fallback sync, and rolling retention.
29. Authentication uses Better Auth + Turso, with no separate hosted auth service.
30. Private registration must be invite-gated to reduce abuse and protect AI spend.

---

# IMPLEMENTATION ORDER

You may choose exact details, but roughly:

1. inspect the repository and existing environment/configuration
2. create architecture/implementation plan in `docs/`
3. initialize monorepo structure
4. initialize Flutter app
5. initialize Vercel TypeScript backend
6. configure Turso + migrations
7. configure Better Auth + Turso auth tables + invite-gated registration
8. create theme/design system
9. routing/navigation
10. demo fixtures
11. onboarding
12. TMDB integration
13. Browse UI and dynamic rows
14. universal title details
15. global search
16. Profile/Settings
17. EPG abstraction/XMLTV parser/ingestion + free sync scheduler/fallback
18. EPG-to-TMDB matching
19. taste model
20. recommendation engine
21. Chat structured protocol
22. OpenAI backend functions
23. interactive Chat actions
24. watchlist/watched/reactions
25. Surprise Me
26. reminders/local notifications
27. deployment configuration
28. deploy backend to Vercel if credentials permit
29. point mobile app at deployed backend for real integration testing
30. error/loading states
31. tests
32. README
33. run analyzers/typechecks/tests and fix issues
34. perform final visual/product/security review

---

# FINAL DEFINITION OF DONE

Do not consider the task complete merely because files were generated.

Before stopping:

- application launches
- real app name is Nex everywhere user-facing
- demo mode works without external credentials
- Better Auth email/password signup/login/logout works against the Vercel backend
- Better Auth auth tables and Nex Turso schema/migrations exist and are usable
- private registration invite gating works
- authenticated Flutter requests use securely stored mobile credentials/session tokens
- backend runs locally
- backend is Vercel-deployable
- backend is deployed to Vercel if credentials permit
- Flutter can call the live/deployed backend when available
- onboarding works
- onboarding can use real TMDB search when configured
- onboarding creates initial structured taste data
- Browse contains realistic dynamic horizontal rows
- Browse prioritizes the user's selected services
- Live/Upcoming TV rows work with EPG/fixtures
- configurable XMLTV ingestion works when a source is supplied
- protected EPG sync endpoint works
- a free scheduling path or documented free fallback is included
- EPG retention cleanup works and does not grow history indefinitely
- Chat renders combinations of text + interactive cards/carousels
- Chat can execute approved actions
- title detail works
- search works
- exact lookup searches all providers
- owned vs non-owned availability is visually distinguished
- reactions persist
- taste model updates
- weak search/open events do not overpower explicit preferences
- temporary context does not overwrite persistent taste
- long-term mood preferences are represented separately from current mood
- watchlist works
- watched history works
- Surprise Me returns one grounded recommendation
- TV schedule appears
- local reminder flow exists
- dark/light/system appearance works
- Settings can change country and streaming providers
- Settings can change audio/subtitle preferences
- conversation reference resolution supports phrases like "the second one"
- authorization prevents one user from accessing another user's private data
- external integrations are behind abstractions
- `.env.example` exists
- `.env` is ignored
- no secrets are embedded in the Flutter app or committed files
- README explains full setup and deployment
- README explicitly documents the free-first infrastructure model and identifies OpenAI as the expected paid usage service
- README explains how to configure/replace the EPG source without requiring a paid provider
- TMDB/JustWatch attribution is included appropriately
- `flutter analyze` passes
- `flutter test` passes
- backend typecheck/lint/tests pass

If credentials or external systems prevent live integration testing, keep the real integration implemented, document the exact setup required, and verify equivalent flows through demo fixtures.

After implementation, perform one final self-review of the application for:

- runtime errors
- broken navigation
- architectural inconsistencies
- visual inconsistencies
- missing loading/error states
- incorrect availability behavior
- authorization mistakes
- exposed secrets
- unhandled API failures
- TODOs that block MVP behavior

Fix issues you find before concluding.

Build the product now.
