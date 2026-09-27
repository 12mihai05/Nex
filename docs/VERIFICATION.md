# Verification record (initial implementation)

Superseded by [the live upgrade verification](FINAL_VERIFICATION.md). The observations below describe the earlier fixture-only environment, not current integration status.

This record documents what was genuinely exercised during the initial implementation run. It must not be read as evidence for credentials or platforms that were unavailable.

## Verified locally

- Drizzle generated the 23-table schema migration and applied it to local libSQL.
- Fixture XMLTV synchronization imported two programs through the real parser/repository path.
- The protected sync endpoint rejected an invalid bearer credential and accepted the configured local development credential.
- Better Auth rejected an invalid invite, created an invite-gated email/password account, returned a bearer token, authenticated a private settings request, accepted a user-owned watchlist mutation, logged out, invalidated the old token, and signed in again.
- Backend TypeScript compilation passed.
- Backend lint and tests were run; the final command output is captured in the implementation handoff.
- Flutter stable 3.47.5 / Dart 3.13.4 was installed into ignored local tooling.
- Flutter analysis passed with no issues.
- Flutter unit/widget tests passed.
- The Flutter web preview was visually inspected at a narrow phone-like viewport: sign-in, onboarding, Browse, interactive Chat response cards, and Settings.
- Dark mode, poster/card language, owned/non-owned badges, primary navigation count, and major-screen spacing were inspected from actual rendered output.

## Not available in the initial environment

- No `.env` or external credentials were present, so live Turso, TMDB, OpenAI, and Vercel calls were not made. Their real adapters, environment contracts, error fallbacks, and fixture equivalents are implemented.
- The Android SDK was not installed. Flutter analysis/tests and browser rendering passed, but an APK/emulator launch was not possible in the initial environment.
- iOS cannot be compiled on Windows and requires macOS/Xcode.
- Vercel deployment was not attempted without a token/project identity.

## Required live-environment acceptance

1. Populate `.env` without committing it.
2. Apply migrations to Turso and rerun the authorization tests against the deployment.
3. Verify a real TMDB search/detail/provider response for region `RO`.
4. Verify one Responses API structured taste extraction and one grounded Chat composition.
5. Configure an authorized XMLTV source, sync it, inspect retention bounds, and spot-check conservative matches.
6. Deploy from `backend`, verify `/api/health`, then run Flutter against the HTTPS URL.
7. Build a signed private Android APK and exercise notification permission plus an actual scheduled reminder.
