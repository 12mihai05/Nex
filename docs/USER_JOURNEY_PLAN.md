# Pre-deployment user-journey acceptance

No deployment in this pass. Use the existing Hono API with real Turso/TMDB/OpenAI and imported RO/BG EPG. Create isolated synthetic users and clean up only their rows. Never log credentials or raw auth responses.

1. Capture baseline endpoint journeys: onboarding, cold-start recommendations, constrained discovery, exact lookup, contextual Chat, feedback/corrections, watchlist/history, Surprise Me, TV and reminders.
2. Check all private resources with a second user; test invalid input, missing auth, disabled reminders, logout and account deletion.
3. Inspect returned titles/reasons, not only HTTP status. Assert hard constraints, nonempty feasible results, personalization, diversity and no immediate rejected/watched repeats. These are objective proxies, not proof of subjective satisfaction.
4. Fix observed defects with focused regression tests. Keep deterministic ranking and free-first architecture; use existing model configuration only.
5. Test Flutter notification scheduling/cancellation boundary with mocks where hardware is unavailable; never label that actual notification delivery.
6. Re-run backend and Flutter checks, live journeys, secret scan and data-cleanup audit. Record exact evidence and remaining device/deployment acceptance.

## Completed follow-up

The final live endpoint suite passed all 15 groups. Then the country expansion imported and verified RO/BG plus GB/ES/FR/CH/IT/DE/MD. Settings keeps one region; explicit Chat overrides are temporary and do not alter the profile. Moldova coverage is limited. Final checks: 49 backend tests, seven ordinary Flutter tests, two separate live Flutter tests and a focused rendering rerun; typecheck/lint/build/analyzer passed. See FINAL_VERIFICATION.md for evidence, subjective ranking limitations, dependency audit findings and remaining native-device/deployment acceptance. No deployment was performed.
