# Nex live verification — 2026-09-26

## Current September 27 TV/Want-to-see update

Later focused correction: [IDENTITY_FOLLOWUP_FIX.md](IDENTITY_FOLLOWUP_FIX.md) fixes missing resolved context at the final AI composition stage. The failed identity/memory follow-up now passes in two live reruns, including one mixed-state sequence; all 26 discovery scenario assertions pass in the fresh sweep. Backend coverage is now 119 tests. See that report for allowed abstentions, fallback responses and the unchanged subjective-quality limitations.

[TV_FAVORITES_REFRESH_RESULTS.md](TV_FAVORITES_REFRESH_RESULTS.md) is the latest implementation and acceptance record. It supersedes the historical counts/navigation below: Streaming, TV and Chat; channel favorites; independent Seen/Want/opinions; capped reversible weak hints; stable five-minute Streaming snapshots; burgundy UI; public TMDB cache improvements; seven additive migrations; 116 backend tests and 18 ordinary Flutter tests. It records separate live HTTP/visual/country/persona results and their limitations. The older sections below are retained as history, not a claim that their unresolved-item lists are still current.

This supersedes the initial fixture-only record. The backend is Hono, not Fastify. This is a local/live-services build, not a deployed or native-device acceptance claim.

## Extended quality run update (latest)

See [DEEP_QUALITY_RESULTS.md](DEEP_QUALITY_RESULTS.md) for the later 26-persona investigation, fixes, abstentions and limitations. It supersedes the older counts and pending items below: backend now has 87 passing tests across 10 suites; Flutter has 12 ordinary passing tests plus two separate live HTTP tests and three separate visual variants. Analyzer and builds passed. Full/production dependency audits now report zero vulnerabilities after a compatible tooling fix, verified with installation and real migration checks. The old esbuild advisory below is resolved, not an outstanding blocker.

Fresh Flutter-renderer visual coverage now includes 23 screens/states in each of dark, light and narrow/large-text layouts, with loaded artwork and manual image inspection. This supersedes the earlier limited Browse review; it does not replace a physical device. Native notifications/release builds and deployed-backend testing remain outstanding. No deployment occurred.

## Passed

- Four Drizzle migrations applied to real Turso, including country-aware EPG and taste evidence; existing data preserved.
- Real Better Auth invite rejection, signup/signin, bearer authentication, anonymous rejection, cross-user taste isolation, logout and token invalidation. Temporary verification accounts removed.
- Real TMDB Romania search/detail for Arrival: 39 providers and three availability entries at observation. Explicit feedback learned 19 taste dimensions.
- Real OpenAI Responses structured taste extraction, intent parsing and composition using configured application models. No Codex billing/execution settings changed.
- Free EPGShare01 schedules imported for RO, BG, GB, ES, FR, CH, IT, DE and MD through the country-aware iptv-org adapter. All nine authenticated regional checks passed, including Settings switching and ignoring URL country overrides. Moldova has only six verified channels; see EPG_SOURCES.md for snapshot counts and coverage limitations.
- Turso audit: zero out-of-retention programmes, zero foreign-key violations, zero remaining verification accounts. Retained historical totals differ from single-snapshot counts.
- Backend typecheck, lint, production build and 49 tests in nine suites passed. Personalization tests cover the twelve requested scenarios plus fatigue, movie/series ID collision, monotonic preference matching, fame as a weak signal, fallback constraints, country interpretation and timezone/DST windows.
- Flutter analyzer: no issues. Ordinary tests: seven passed, two opt-in live tests intentionally skipped. Notification-platform mocks cover scheduling, stable cancellation IDs, permission denial and past-time validation.
- Separate live Flutter run: both tests passed against local HTTP Hono using real Turso/TMDB/OpenAI. Includes auth, settings, search, watchlist, feedback, recommendations, Romanian TV, Chat lookup/watchlist action, stored-session restoration, logout and actual Browse rendering. A subsequent focused rendering run also passed after correcting the test viewport.
- Flutter web production build passed with a local development API URL, not a deployed production configuration.
- Final npm audit: four moderate findings in the Drizzle Kit → deprecated esbuild-kit → esbuild 0.18 dependency chain (GHSA-67mh-4wv8-2f99). Although Drizzle Kit is a development dependency, Better Auth's optional peer causes it to appear in `--omit=dev` audit as well. The advisory concerns esbuild's development server, which Nex does not expose. An attempted scoped override did not update npm's resolution and was removed; no ineffective mitigation is claimed. A compatible upstream/toolchain update remains to resolve this before treating the dependency audit as clean. Do not use the suggested breaking downgrade blindly.

## Real user journeys and fixes

`backend/scripts/user-journeys.ts` finished with 15 passed, zero failed, and both temporary accounts removed. It exercises production Hono handlers with real configured Turso, Better Auth, TMDB and OpenAI; the separate Flutter run covers the actual HTTP transport.

The groups cover anonymous/cross-user authorization; partial settings; onboarding/cold start; exact lookup and ownership; runtime/genre/provider constraints; watchlist/history/dislikes; Surprise rejection; Chat follow-up context without permanent taste changes; referenced watchlist add/remove; TV country and reminder lifecycle; disabled/past/invalid reminders; tomorrow-TV Chat create/cancel reminders; invalid input and protected sync; different personas and explicit correction; account deletion and token revocation.

Initial runs exposed real defects: negative preference extraction, omitted language settings being erased, false provider-ownership flags, Chat treating streaming “tonight” as TV, removal interpreted as addition, lost follow-up constraints, invalid reminder errors, extra preference matches reducing scores, and a programme overlapping midnight appearing as a tomorrow start. These were fixed and rerun. The final fallback-only intent refinement was additionally covered in the 49-test offline suite.

Country verification additionally passed an explicit France Chat request, unchanged Romanian Settings/Browse, and an unnamed follow-up returning Romanian TV. Accounts used by every live verification script were removed; the final aggregate database audit found zero remaining verification accounts, zero foreign-key violations and zero programmes outside retention. Four migrations remain applied; rerunning migration was successful and preserved existing data.

Recommendations now retrieve a broader relevant pool and keep popularity weak, rather than banning familiar films or forcing obscure picks. Strict mechanical constraints and learning boundaries are tested. Subjective quality is not proven optimal: a nature-documentary persona still received some general documentary results beyond strong nature matches, and catalog tags cannot guarantee mood or safety suitability. See PERSONALIZATION.md for the practical design and limitations.

## Visual verification

Actual live Browse was rendered at 430 × 932 in a Flutter widget test. Screenshot: ignored `mobile/build/verification/live-browse.png`. A real card overflow was fixed; typography, spacing, navigation and Romanian programmes were inspected. Artwork remained loading placeholders, so image loading is not fully visually verified. Earlier browser checks of auth, onboarding, Chat and Settings do not replace a fresh visual regression of every changed screen.

## Security and secret handling

Credentials stay in backend processes and are never printed or inserted into Flutter. `.env` and local databases are ignored. The scanner checks source/docs/generated text for configured secret values and reports filenames only. Live Flutter receives only ephemeral test-account credentials; its accounts are deleted afterward. No secrets were committed or copied into documentation. Scanning is evidence, not a guarantee against every leak mechanism.

Private handlers resolve Better Auth's user server-side. Tests exercise repository isolation and session ownership/expiry. Daily AI quota consumption is atomic. XMLTV rejects entities and enforces size limits/public HTTPS checks. Sync failure retains valid cached data while retention pruning continues. No paid EPG or infrastructure was introduced.

## Remaining acceptance checks

- Deployment was deliberately deferred at the user's request. Earlier Vercel credentials/project configuration were unavailable; this run did not revalidate deployment access. No deployment was performed, so Flutter-to-deployed-backend E2E remains untested. Deploy the backend only, configure production secrets/origins, enable Fluid Compute for the 120-second duration, and repeat authenticated HTTPS smoke tests. Build/distribute Flutter separately.
- GitHub Actions EPG workflow is implemented but not pushed/enabled/configured remotely. Add Turso secrets and public country/feed variables to activate daily imports. Until then use manual sync.
- Android SDK is absent: no APK, device launch, release signing or actual notification permission/delivery test. iOS requires macOS/Xcode. Backend reminder lifecycle and Flutter plugin-boundary tests passed, including compensation when scheduling fails; these do not prove a real device displays a notification.
- Fresh visual review of all major screens, including loaded artwork, remains necessary. The live Browse widget check is narrower.
- Password-reset email is unconfigured. Stored-session restoration is implemented and live-tested. Reminder reconciliation following EPG changes or across devices remains a V1 limitation; logout cancels local reminders and signing back in does not automatically reschedule them.
- Free feeds have no uptime guarantee. Nine countries were verified, not every country worldwide. Moldova is limited, and larger feeds can reach deliberate size limits. New-region imports and 75 MB parsing bounds were tested locally, not yet on the remote scheduled runner.
- The moderate esbuild development-tool advisory above remains unresolved. No esbuild development server should be exposed.

## Repeatable checks

From repository root, using ignored local `.env`:

```powershell
npm run backend:check
npm --workspace backend run build
node --import tsx backend/scripts/verify-live.ts --epg --flutter
node --import tsx backend/scripts/user-journeys.ts
node --import tsx backend/scripts/verify-countries.ts
node --import tsx backend/scripts/audit-live-db.ts
node --import tsx backend/scripts/scan-secrets.ts
npm audit --omit=dev
```

The live script applies pending migrations, creates/deletes only its temporary users, optionally imports EPG and makes paid OpenAI application API calls. In `mobile`, run `flutter analyze`, `flutter test`, and `flutter build web --dart-define=API_BASE_URL=<public-api-origin>`.

The secret-value scanner checked 198 source/generated text files with zero configured-secret matches before this report update; final reruns should retain the same zero-match requirement. It does not inspect arbitrary binary formats or prove absence of every possible leak.

The Definition of Done is **not fully met** until deployment and native-device/reminder acceptance are completed. The later quality run resolved the dependency advisory and completed the described Flutter-renderer visual regression. Successful compilation alone is not completion.

## September 27 — independent seen/opinions and approved weak-history hint

See [SEEN_FEEDBACK_RESULTS.md](SEEN_FEEDBACK_RESULTS.md) for the superseding results and caveats. Seen/unrated now supplies a capped 0.12 affinity hint, not a literal Like. Explicit opinions override it. An additive fifth migration was applied to real Turso. Flutter restores all library snapshots and independent opinions and provides adjacent editing controls.

Backend checks: 108 tests in 11 suites, typecheck/lint/build passed. Flutter: 15 ordinary tests passed (five opt-in skips); three visual variants separately passed, analyzer clean, final web release build passed. Real HTTP integration and the 26-persona evidence are detailed in the linked report. Production dependency audit and Drizzle migration consistency check passed.

The weak-seen full persona pass was 25/26 against its original assertions, with four explicitly allowed abstentions and one correctly impossible runtime request. The competence/problem-solving request remains a retrieval failure. Mixed-state checks passed across all 26 backgrounds, using a separate focused run for the failed discovery persona. Manual review also caught and fixed stale follow-up concepts and incomplete AI prose; focused reruns, rather than a second complete 26-persona sweep, validate those final guards. Do not interpret automated passes as proof of subjective recommendation quality.

No deployment or native-device testing was performed. The new report preserves remaining acceptance work rather than claiming the complete Definition of Done.
