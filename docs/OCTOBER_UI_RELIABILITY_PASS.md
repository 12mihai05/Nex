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
- Backend commit `63910dc` reached Vercel READY and both production domains. Production HTTP checks passed: signup/sign-in, series season count, Seen artwork, Chat restoration across sign-in, explicit Clear without losing Seen history, and next-day guide (20 channels / 125 programmes). The disposable account was deleted and its session verified revoked.
- GitHub EPG run `38950127434` succeeded with empty optional input, selected RO and imported 44,166 records. This verifies the scheduled entry point, not only the helper function.
- The broader Chat intelligence pass remains separate from this UI/persistence request. Physical Samsung interaction/appearance is for the user's final acceptance test.

## Phone acceptance checks

1. Reopen the app and Chat; messages/cards should remain. Clear only when you want to delete the conversation. Verify returning from another tab opens the recent end of restored history.
2. Open a series, expand/collapse seasons, select another season; check season-count metadata and readable episode dates. A title missing season data says Series, not an episode runtime presented as a movie duration.
3. Open Seen and Want to see. No plus shortcut; missing legacy artwork fills progressively. Filters still work.
4. Scroll the TV guide sideways beyond eight hours and into tomorrow, and vertically through channels. Favorites should change immediately without jumping the list. Profile replaces Refresh; Now returns to the current time. Source gaps remain explicitly empty.
5. Open Taste topics, search, switch More/Less/Neutral, and edit/remove a preference. Learned patterns remain separate; no artificial neutral preferences were created.
6. Check light mode contrast and verify dark mode is unchanged. Change Taste: Home should retain its current shelves until you intentionally pull to refresh, with no Taste-updated banner.
