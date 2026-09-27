# Nex implementation plan

This plan turns `NEX_SPEC_FREE_FIRST.md` into one deployable monorepo. Work proceeds in vertical slices so demo mode remains runnable while live integrations are added.

## Delivery sequence

1. Establish repository hygiene, environment contracts, architecture, and shared domain vocabulary.
2. Build and test the Vercel TypeScript API: configuration, validation, errors, Turso/Drizzle schema and migrations, Better Auth, invite gating, repositories, TMDB, XMLTV ingestion, recommendations, AI orchestration, chat actions, and all domain routes.
3. Build and test the Flutter client: design system, secure authentication, onboarding, two-tab shell, Browse, Chat blocks/actions, search, title detail, profile/taste/settings, watchlist/history/feedback, Pick for me, and local reminders.
4. Verify fixture/demo mode, local backend behavior, XMLTV retention and matching, authorization isolation, API schemas, Flutter analysis/tests, and production builds where the local toolchain permits.
5. Exercise real integrations only when credentials are present, deploy to Vercel when credentials permit, then audit the complete Definition of Done, security, user-data ownership, visual consistency, and documentation.

## Quality gates

- No backend secret is compiled into Flutter or committed.
- Every private route derives ownership from the validated Better Auth session.
- Search intent and recommendation availability scope remain distinct.
- AI output is schema-constrained, revalidated, grounded in backend candidates, and protected by daily per-user limits.
- XMLTV is replaceable, protected, deduplicated, UTC-normalized, and retention-bounded.
- Browse and Chat use the same typed content cards and recommendation evidence.
- Demo mode exercises every primary flow without external credentials.
- Backend typecheck, lint, tests, migration checks, and Flutter analyzer/tests pass before handoff.

## Environment constraints discovered at start

- Node.js and npm are available.
- Flutter/Dart and the Turso CLI are not initially on `PATH`; the implementation will remain complete and their absence will be addressed or precisely reported during verification.
- No local `.env` was present at initial inspection, so external calls begin in fixture mode unless credentials are supplied later.
