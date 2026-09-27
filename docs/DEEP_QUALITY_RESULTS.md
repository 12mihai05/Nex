# Extended recommendation and application review — 2026-09-26

## Scope

26 distinct synthetic personas were exercised through production Hono handlers with real Better Auth, Turso, TMDB and configured OpenAI models: 20 main personas and six holdouts, plus repeated fix/rerun cycles. Assertions check constraints, ownership, valid catalog items and persistence boundaries. Actual shortlists and replies were also reviewed. These are not 26 human satisfaction measurements; mechanically passing results can still be mediocre recommendations.

Evaluation design follows [OpenAI evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices): explicit criteria, typical/edge/adversarial examples, iteration and separate qualitative review. No paid infrastructure was added. Application OpenAI calls incur normal usage charges; Codex execution/billing configuration was not changed.

## Combinations tested

Underdogs across genres; underdog comedy without sport; redemption/crime; found family/science fiction; revenge/clever planning without gore or torture; survival comedy; journalism/conspiracy; underdog-to-time-loop follow-ups retaining Netflix/runtime; identity/memory; competent problem-solving teams; class satire; nature/ocean documentaries without celebrity/concert content; friendship/reconnection/regret; adult-oriented animation; Japanese original language; comfort-to-tense-mystery shifts; eerie psychological stories; impossible runtime bounds; uncertain taste; adversarial instructions.

Holdouts: required underdog AND time-loop in one film, absurd bureaucracy without slapstick, unreliable perception/thriller/runtime/violence constraints, female ambition/underdog/no romance, Japanese live-action everyday friendship, and heist/teamwork/ethical dilemmas without gore. Unit cases additionally test 20 concepts across genres and compound constraints.

## Findings and changes

- Idea-led requests previously drifted to popular or generic genre matches. Retrieval now includes independent topic pools, verified TMDB keyword IDs and trusted synopsis evidence. Permanent interests are not forced into one impossible intersection.
- Concepts and genres are separate. Found family is not the Family genre; science fiction does not imply a separate science topic; live-action is not Action. Explicit intersections and alternatives are represented separately.
- Original language, runtime, watched exclusion and ownership are enforced independently of AI prose. Model-invented prompt-example exclusions are removed.
- A small inspectable synonym bridge supports common concepts without a vector database or training pipeline. Browse diversifies supported interests. Fame stays weak; familiar movies are neither banned nor automatically preferred.
- Concept Chat uses the configured stronger model to review up to 12 already-filtered candidates in the existing composition call. It may narrow the list but cannot invent IDs, reorder ranking or bypass constraints. Exact excerpts from supplied metadata are validated. This proves evidence provenance, not perfect semantic truth.
- Underdog/no-sport results included Carry-On, Orion and the Dark, Knock Down the House and Shirley. The editor removed a questionable Taking Lives match without a title blacklist. Tight underdog-comedy requests sometimes correctly yielded only one or two choices.
- Nature/ocean documentary results narrowed to Chasing Coral and My Octopus Teacher. Found-family science fiction stopped padding with Ex Machina.
- Required underdog AND time-loop yielded an explicit no-match: no supported match in the retrieved pool, not proof that no such film exists.
- One acceptance run failed its original nonempty expectation for revenge/clever-plan/no-gore. The rubric now explicitly allows explained abstention for that safety-sensitive case. A focused rerun offered Nine Queens cautiously. Original failure evidence is retained, not rewritten into a perfect uninterrupted pass.
- Holdout review caught live-action incorrectly entering the TV branch. Code and assertions were corrected. The original holdout's apparent pass is not treated as proof of semantic quality.
- Latest main acceptance: 19/20 under its original rubric, with the documented safety-sensitive abstention as the only failure. The six-case holdout run exposed the routing defect despite its original permissive assertions; a stricter Japanese live-action rerun passed with an explicit no-match and no TV routing. Mood-led review was then enabled and its focused real rerun passed: the eerie shortlist no longer contained the unrelated nature documentary or Young Hearts. It returned It's What's Inside, When Marnie Was There, A Quiet Place, The Sixth Sense and The Truman Show. No clean all-26 rerun after these final narrow fixes is claimed.

## Verification

- General real user journeys: 15/15 groups, covering auth/isolation, onboarding, settings, search, feedback/history, Chat actions, reminders, invalid requests and deletion.
- Backend: 87 tests / 10 suites, typecheck, lint and production build passed.
- Flutter: 12 ordinary tests passed, five opt-in checks skipped in that run. Separately both real HTTP tests and all three visual variants passed. Analyzer clean; web production build passed with a local API URL.
- Visuals: 23 captures each for dark, light and narrow/1.4-text-scale, plus live Browse. Loaded artwork was asserted and screenshots inspected. Fixed broken demo backdrop, missing rating glyph and demo Chat ignoring runtime/service constraints. These are Flutter renderer checks, not physical-device acceptance.
- Notification tests cover scheduling, cancellation, permission denial, initialization failure, exact-alarm denial and invalid offsets. Fixed cold-process cancellation and added a monochrome Android notification icon.
- Dependency advisory resolved through root-level shared Drizzle Kit tooling and a compatible esbuild override. Full/production audits report zero vulnerabilities. Install dry-run, Drizzle schema check and real migration rerun passed. Dependencies are pinned.
- Final ordinary Flutter rerun again passed 12 tests with five opt-in skips; analyzer clean. Secret scanning checked 211 text files with zero configured-secret matches. The scan is evidence, not proof against every leak mechanism.
- Final real Turso audit: four migrations, zero foreign-key violations, zero programmes outside retention, zero remaining synthetic verification accounts. EPG data exists for RO, BG, GB, ES, FR, CH, IT, DE and MD; Moldova remains limited to six verified channels.

## Limits and next steps

Metadata can be noisy or absent. Broad Browse can still contain incidental matches; friendship/identity are particularly broad. Mood-only requests are less precise than supported concepts. Missing content-warning/ending metadata cannot certify suitability. AI failures produce a labeled catalog-based fallback. Bounded retrieval can miss films, and model variation remains. This is substantially improved, not proven optimal.

Android SDK/phone are unavailable; iOS requires macOS/Xcode. Physical notification delivery, reboot behavior and native release builds remain unverified: see DEVICE_ACCEPTANCE.md. Password-reset email and automatic reminder reconciliation after EPG changes/across devices remain V1 limitations.

No deployment was performed. Next: backend-only deployment, authenticated HTTPS/Flutter smoke tests, and native-device acceptance. The daily EPG workflow still needs remote secrets/activation. Mobile distribution is separate.

Evidence: ignored `.tooling/verification/personas-*.json` (synthetic prompts/public metadata only), and `mobile/build/verification/*.png`. Scripts delete only their temporary users. Secrets remain backend-only and are absent from reports/screenshots.
