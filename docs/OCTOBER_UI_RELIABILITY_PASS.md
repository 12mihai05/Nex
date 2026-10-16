# UI and persistence pass

Implement the user's October notes as one tested pass, preserving dark mode and existing recommendation logic. No new provider.

1. Restore server-owned chat history lazily on Chat entry, page older messages, resume the latest conversation, never replay action side effects. Explicit Clear remains the deletion boundary; temporary intent still expires.
2. Carry season counts from TMDB into compact cards; never display episode runtime as movie duration. Collapsible season details with readable dates. Remove duplicate synopsis action.
3. Persist Seen artwork for new entries and progressively repair older missing artwork while browsing the library. Remove library add shortcuts.
4. Continuous TV timeline using bounded six-hour windows, cached and loaded for visible channel pages. Preserve channel ordering during favorite changes. Investigate actual source coverage, not just UI.
5. Taste overview, readable grouped controls, styled editing, audit neutral handling without inventing neutral signals. Light palette becomes cool neutral with a restrained cherry accent; dark remains unchanged. Home refresh stays pull-to-refresh only.

Validate authorization/persistence, timeline windows, metadata and neutrality with regression tests, full suites and Android build. Render affected screens for visual inspection. Test production with disposable accounts only. Reference: https://docs.flutter.dev/cookbook/lists/long-lists (lazy rendering).

## Verification, October 16

- Backend: 308 tests, typecheck, lint and build passed.
- Flutter: analyzer clean; 106 tests passed, 20 opt-in visual/device tests skipped in the ordinary suite. Separately ran 8 visual scenarios covering theme variants, major screens, season controls and large text. Android debug APK built successfully.
- Added regression coverage for history ownership/pagination/clear, restoration without replaying actions, clear-during-restore, neutral ratings, artwork persistence, season counts, stable guide rosters, continuous timeline loading and window reuse.
- Applied additive nullable Seen poster migration to Turso. Existing records remain intact; missing legacy artwork is fetched progressively when browsing the library.
- Found scheduled EPG success-with-no-import bug: empty optional country input became a one-element empty-string filter. Empty input now correctly syncs active countries. Live RO import succeeded with 44,166 programme records; subsequent coverage showed 26,176 current/future programmes on 344 channels. Availability varies by source/channel; the guide does not invent missing schedules.
- Changed-file scan against configured secrets passed. No new provider, no saved Taste rewrite, no user account inspection, no physical-phone testing.
- Deployment and disposable-account production checks are recorded after publishing. The broader Chat intelligence pass remains separate from this UI/persistence request.
