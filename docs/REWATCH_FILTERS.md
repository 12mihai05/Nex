# Viewing and service filters — 29 September 2026

Home remains discovery-first. Its default plan reserves a single Watch again shelf
after the first six shelf definitions. It appears only with at least three available,
explicitly Seen + Like/Super Like titles. Seen alone and Meh do not qualify;
Dislike and recent explicit rejections remain excluded. History remains a library.
History creation timestamps are not treated as actual viewing dates.

The filter sheet offers New to me, Watch again, and Either, alongside genre and exact
movie duration bounds. New to me preserves the existing exclusion of both seen and
rated titles. Explicit filtered New to me results do not contain the rewatch shelf;
the unfiltered default Home has the single separate rewatch exception. Watch again
requires actual Seen history, not merely a rating. Either allows both groups.

Service chips start with all saved subscriptions. A temporary subset affects only
this view, never profile settings. At least one service is required. Backend retrieval
and final ranking enforce that subset and the user's country. Unknown/non-owned
service requests return no results rather than silently widening the selection.

History candidates use cached TMDB metadata, not a hope that popular discovery
returns the same titles. Hydration is bounded to 20 liked/seen titles for the default
shelf, or 60 candidates for explicit viewing filters. Long lists rotate daily, with
liked titles ahead of unrated seen titles. This is a recommendation sample, not an
exhaustive History listing. Three concurrent lookups and a bounded, 60-second,
history-sensitive in-memory cache keep subsequent shelf batches cheap. No AI call
is added. Existing shared metadata/availability TTLs still apply.

Client snapshots include viewing mode and sorted service IDs. Country/account/service
scope changes reset temporary selections. Rendering removes newly disliked or
out-of-mode titles without reordering the cached feed. Seen cards have a badge.

Verification (updated after rollout): backend typecheck, lint, 149 tests, production
build; Flutter analysis, 57 tests, separate dark/light visual renders, Android debug
APK build. Streaming service chips now use explicit matching foreground/background
colors, with contrast tests in both themes. Pick for me includes service and viewing
selectors, inherited from Home and independently editable without profile writes.

The previous production build rejected all four new Home filter parameters with HTTP
400. Backend-only deployment `dpl_AV1NKf5GUGWpXx8UStpGnYfET3g7` is READY on both
`nex-three-omega.vercel.app` and `nex-mihai19.vercel.app`. It was deployed directly
from the local source allowlist (not a Git push); commit/push these changes before
a future Git-triggered redeployment to avoid reverting the fix.

The live disposable-account journey now verifies all viewing modes and Netflix-only
Home/Pick results, independent Seen + Like writes, exclusion from New to me,
inclusion in Watch again/Either, and rejection of an empty Pick service selection.
The account was deleted and its session revoked afterward. No AI calls are added.
Real-phone UI interaction and iOS compilation have not been performed in this update.

GitHub Actions investigation: run 36552657543 failed in “Sync bounded country feeds
directly to Turso”; checkout, Node setup and npm ci succeeded. Public annotations
show only exit code 1. Detailed logs require authentication (public request: 403).
Local Git credential extraction was blocked by security review; no token was read.
The root cause is not yet established; no workflow changes or reruns were made.
