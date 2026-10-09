# Nex Taste comparison — final engineering report

Verified 10 October 2026. Implementation is local; no push, deployment, production profile change, or production Turso migration was performed in this run.

Release follow-up: after the user authorized deployment, migration 0007 was applied to the verified production database; the existing account/profile counts were unchanged and disposable identity-check accounts were deleted. The production embedding model settings were configured. The implementation findings below describe the pre-deployment evaluation; production rollout is a separate verification step.

## Decision

The best candidate tested is **semantic story matching plus Nex's existing structured rules**, using `text-embedding-3-large` with 1024 dimensions. Keep the optional GPT shortlist review out of ordinary feed requests. It was much slower and did not establish an additional recommendation-quality benefit.

This is a better tested candidate, not proof of the best possible recommender or of what any particular person will enjoy. Keep the classic engine available and default unchanged until a personal trial.

## What changed

- Preferences can retain an open-ended story meaning and the user's source quotation, rather than being reduced entirely to separate genre/theme tags. Qualified relationships remain together; quoted evidence must occur in the input.
- Several interests remain separate. Favourite-title examples do not collapse all of a person's tastes into one averaged vector. Explicit Like/Super Like supply these examples; Seen and Want to see remain weaker existing signals, not equivalent to liking.
- Positive and negative semantic evidence is bounded. Conditional dislikes apply only inside their scope. Existing country, service, duration, watched-state, explicit-title and other eligibility rules remain authoritative.
- Home, Pick, Chat recommendation paths and discovery search use the shared preparation layer. Home additionally has bounded favourite-related retrieval in experimental mode. Ordinary exact-title lookup does not call the semantic model.
- Preference corrections/removals invalidate derived private state. Home remains stable until deliberate refresh; the next Pick uses current saved Taste. Engine selection is saved before the app displays success and does not reset the user's profile.
- Public metadata vectors and private user-derived data are separate. Cached float32 vectors use substantially less serialized space than decimal arrays, without material precision loss in the test. Cache keys include model and input identity; duplicate in-flight preparations are coalesced.
- Reduced the experimental ranking's genre-diversity penalty after finding that it could displace stronger personal matches. The classic scorer's diversity behavior is unchanged.
- Added contextual definitions for bare legacy story tags. This fixes a regression where a stronger embedding model handled the bare word “underdog” less reliably than a meaningful description. User-specific meanings take precedence over the definitions.

## Fair comparison of old and new Taste handling

Twenty-four authored personas cover 46 predeclared preferred-versus-distractor relationships in the same 32-title fictional catalog. They include combined interests, cross-genre concepts, scoped negatives, conflicting signals and story relationships. These are engineering judgments, not observed user ratings.

- **Frozen previous extractor + classic scorer:** 26 preferred results, 20 ties, zero reversed pairs.
- **Current extractor → persisted Taste → new semantic scorer:** 46 preferred results, zero ties, zero reversed pairs.
- **Final direct-profile semantic regression suite:** also 46 preferred results across all 24 personas.

The distinction matters: the old engine did not make 20 wrong choices; it could not distinguish those pairs. A separate comparison that gives the old engine new `story` fields it never understood is retained for diagnostics, but is not the primary fair baseline.

Sources: `evaluations/legacy-profile-comparison.json`, `evaluations/extracted-profile-final-large.json`, and `evaluations/semantic-final.json`.

## Model selection and real titles

On 26 real TMDB records, five embedding/representation variants were compared using eight diagnostic pairs and 12 additional held-out pairs defined before their metadata was fetched. This isolates embedding similarity from other ranking factors.

- Initial small/512 with plot and metadata: 18 of 20 preferred pairs; all 12 held-out pairs passed.
- Selected large/1024 with plot and metadata: 20 of 20; all 12 held-out pairs passed.
- Removing metadata and embedding only the plot was not consistently better.

The diagnostic cases influenced tuning; the tests are small, author-labeled, and not an independent user study. Both models passed the earlier fictional suite, which is why real-metadata tests were necessary. Intermediate failed large-model legacy-tag cases remain in `large-before-tag-context.json` and `legacy-tag-regression.json`; they were not discarded from the evidence.

Six additional profiles were exercised through the actual extractor and inspected against 45 cached real movie records. Unreliable-reality preferences brought The Truman Show, Eternal Sunshine, Memento, Donnie Darko and Fight Club to the front. Investigation preferences surfaced Spotlight and Erin Brockovich. However, the shared-meals/belonging profile still returned broad, loosely relevant titles alongside Chef. Teamwork preferences also had an overly broad tail.

This is not a complete catalog or a popularity-bias study: the manually selected pool contains many famous films. It cannot establish discovery quality for obscure content or every streaming region. See `embedding-representations.json` and `real-profile-final.json`.

## Optional AI review

The original full three-arm run covered 24 synthetic cases and six real-metadata profiles. Twenty synthetic reviews were accepted; four fell back to semantic matching. All six real-profile reviews fell back. Cold reviews frequently took tens of seconds, with a 45-second timeout; the effective pairwise output did not improve on semantic matching. Invalid IDs, missing/unsupported quotations, polarity/scope mismatches and incomplete results are rejected.

A final three-case smoke rerun is saved separately in `recommendation-comparison-large.json`: all three reviews were accepted and all six pairs passed, the same as semantic-only. Two cold reviews took 30.624 and 27.948 seconds; the cached review took 16 milliseconds. Cached reviews can be fast, but that does not remove cold-request latency. The feature remains opt-in for experimentation, not the recommended feed setting. Recorded API usage counts completed responses only and is not a complete billing ledger; timed-out requests can still incur usage.

## Does saved Taste reach the feed?

Yes, within the tested local backend. The real integration journey exercised account creation, engine settings, Chat preference extraction, saved Taste, Home, independent Seen/Watchlist/Super Like actions, Pick, correction, forgetting and account deletion. Home and Pick responses contained semantic ranking evidence. The new private caches were removed by account deletion.

The journey used the real Better Auth code plus real TMDB and OpenAI calls, with a disposable account in a local SQLite database and in-process endpoint requests. It did **not** exercise production Turso, the Vercel network path or a physical phone. The account was deleted after the test.

Illustrative last-run durations: Home 1.905 seconds; Pick 3.291 seconds; Chat extraction 7.674 seconds. These are single local integration observations, not production benchmarks or before/after speedup claims. Warm local semantic scoring in the comparison was generally milliseconds; provider/cache misses cost more. See `personalization-flow.json`.

## Verification completed

- Backend typecheck, lint and build passed. All 197 tests in 25 files passed.
- Flutter analyzer passed. Ordinary suite: 75 passed, 17 opt-in checks skipped. Skipped checks are not claimed as passed.
- Separately enabled recommendation visual checks: three passed. Dark, light and large-text screenshots were inspected; no overflow found in the changed control.
- Android debug APK built successfully. No physical-device interaction was verified in this run.
- Migration applied to local test/benchmark databases; generated schema snapshot compared with current schema with zero drift statements.
- Cross-user private-cache isolation, deletion cascade, expired-entry renewal, malformed vectors, denied budget, duplicate requests, failed settings saves and strict review validation have regression coverage.
- Known-secret scanner checked 1,057 files with no configured-secret matches and printed no credential values. This is not a guarantee that every possible unknown secret is absent. Local credentials and database files remain ignored.

## Limits and next improvements

1. **Personal relevance still needs a human trial.** Compare fresh Home/Pick choices for the same account without changing the profile between variants. Record which titles the user would actually choose, not merely whether a description matches a label.
2. **Candidate coverage and metadata remain bottlenecks.** Better matching cannot retrieve a movie absent from the candidate pool or infer missing plot details reliably. Investigate bounded, cached narrative facets on real metadata before adding costly per-request AI reasoning.
3. **Weights are still heuristics.** Similarity is not a calibrated probability of enjoyment. This implementation does not train per-user coefficients or learn from viewport impressions. Do not add learning from non-clicks until exposures and intentional actions are distinguished.
4. **Working sets are bounded.** The full stored Taste is preserved, but only 32 direct semantic preferences and eight positive example titles participate in this extra layer per preparation. A large, long-lived profile will eventually need better context-dependent interest selection, not an unbounded request.
5. **Negation is not magically solved by embeddings.** Separate scoped negative evidence and grounded extraction help, but some extracted descriptions still retain qualified negation. The qualitative failures remain visible in the reports.

## Safe rollout

Before deploying this code, apply `0007_recommendation_experiment.sql` through the existing migration mechanism to the intended Turso database. Back up/verify the target first. New backend code queries the added profile column, so deployment before migration is not safe.

Set the backend's non-secret model settings to `OPENAI_EMBEDDING_MODEL=text-embedding-3-large` and `OPENAI_EMBEDDING_DIMENSIONS=1024`; the defaults and local example now match. Existing OpenAI chat-model settings and API credentials are unchanged. Never copy backend keys into Flutter.

Deploy only the backend, then run the Flutter client against that deployment. In Your Taste → Recommendation test, choose Story matching and deliberately refresh Home. Pick uses the saved choice on the next request. Keep Classic as the rollback choice. Changing the mobile UI alone cannot enable an undeployed backend.

## Reproduction

From `backend`, run `npm run check` and `npm run build`. The comparison scripts use local ignored databases and synthetic users; they can make billable application OpenAI calls. Run the main comparison first to initialize the local comparison database.

- `npx tsx scripts/compare-recommendations.ts --semantic-only`: all direct-profile pairs.
- `npx tsx scripts/compare-legacy-profile.ts`: frozen old extractor comparison.
- `npx tsx scripts/compare-extracted-profile.ts`: current extractor and persisted-profile comparison; only `--reuse-results` explicitly reuses entire previous results.
- `npx tsx scripts/compare-embedding-representations.ts`: real-metadata embedding variants.
- `npx tsx scripts/verify-real-personalization.ts`: qualitative real-title reranking, reusing saved extracted signals where available.
- `npx tsx scripts/verify-personalization-flow.ts`: disposable endpoint journey.
- `npx tsx scripts/compare-recommendations.ts --quick`: three-case optional AI review smoke test.

From `mobile`, run `flutter analyze`, `flutter test`, and the opt-in recommendation visual test with `NEX_VISUAL_QA=1`. Raw reports preserve run-specific outcomes; reruns can vary as provider models and catalog metadata change.
