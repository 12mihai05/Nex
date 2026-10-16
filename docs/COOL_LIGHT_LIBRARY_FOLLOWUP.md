# Cool light and library follow-up

- Removed the experimental warm-paper palette and its device setting. Existing installations now use cool light regardless of the obsolete saved toggle; dark palette colors are unchanged.
- Paired TV favourites, Pick for me and Chat confirmation icons with their container foreground colors. Selected icon buttons have an explicit contrasting fill/foreground, including Taste's recent-sort control.
- Taste polarity and recent sorting share one horizontally scrollable row, preserving accessibility at large text sizes.
- The shared genre menu used by Home and both libraries has rounded corners, theme surfaces, a bounded height, a genre icon and a checked/accented current selection.
- Older Seen snapshots can lack artwork. History now retrieves cached catalog artwork with indexed joins in the same database query (no extra external calls); existing snapshot artwork wins. Only artwork is taken from an expired cache, never availability or release information. Missing cache entries still use the existing bounded lazy fallback. The app retains hydrated title details when leaving and reopening a library.

Validation: backend typecheck/lint/build and 310 tests pass; Flutter analyzer and 110 tests pass (20 opt-in checks skipped). Five focused visual cases passed separately for menus in both themes and Taste in both themes/large text. Android debug APK builds. The broader visual tour was interrupted after its dark case; no claim of a completed full tour or physical-device testing in this pass. No production user data modified.
