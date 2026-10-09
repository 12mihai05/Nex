# Taste v2 comparison — implementation plan

Status: implemented and locally verified, 10 October 2026. See [results and rollout boundaries](TASTE_V2_RESULTS.md). This is an experiment, not a claim of improved human satisfaction. Not deployed; production migration has not been applied.

## Scope and architecture

Preserve the current deterministic scorer as the baseline. Add two opt-in engines: semantic multi-interest matching, and the same matching with a bounded, grounded AI shortlist review. Keep canonical IDs, existing eligibility checks, current reactions/history/watchlist semantics, user authorization and the free-first stack. No account reset, catalog mirror, paid vector service or training infrastructure.

1. Add versioned public title-embedding storage and user-owned derived caches with expiry and deletion. Store selected engine in the existing profile. Default remains baseline until a human comparison justifies changing it.
2. Extend existing Taste evidence with source-linked, open-ended story statements; do not replace the structured profile with a prose summary. Preserve conditions and correction/removal semantics. Semantic matching uses independent interests and liked-title examples, never one averaged personality or an unconditional disliked-title vector.
3. Introduce one preparation/ranking adapter consumed by Home, Pick and Chat. It computes cached semantic evidence, leaves hard filters authoritative, and can review at most a small supplied shortlist with structured AI output. Unknown IDs, unsupported evidence and failed calls fall back safely.
4. Add bounded favourite-based retrieval to the experimental Home path. Keep same-pool scorer comparisons separate from retrieval experiments so their effects are not confused.
5. Expose a reversible engine choice in Your Taste for testing. A Taste edit is authoritative immediately; the next deliberate Home refresh uses the new profile. Do not reshuffle Home during an edit.
6. Build a reproducible comparison harness with predefined expected relationships, diverse/contrasting personas, cache/cost/latency measurements and blind lists for human review. Automated labels are engineering judgments, not proof of user enjoyment.

## Verification

- Deterministic unit tests for semantic normalization, independent interests, condition scope, negatives, explicit overrides, grounding, duplicate IDs, failures and budgets.
- Repository/API-to-feed tests: save/edit/remove Taste and ratings, select each engine, refresh Home, check ordering changes and all eligibility constraints.
- Cross-user cache isolation and account-deletion tests; private preference text never enters public metadata caches.
- Live embeddings and structured review when credentials permit, using synthetic test users only. Never print secrets or personal account data.
- Existing backend lint/typecheck/tests/build and Flutter analyzer/tests/build; manually inspect the changed Taste control where the environment permits.
- Report baseline versus variants honestly, preserve regression cases, and do not automatically promote a variant based only on synthetic tests.

## Research used

- [OpenAI embeddings](https://developers.openai.com/api/docs/guides/embeddings)
- [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Multi-interest retrieval](https://proceedings.mlr.press/v202/shi23b.html)
- [Language-based profiles and their limitations](https://arxiv.org/abs/2402.15623)
- [Selection bias in evaluation](https://arxiv.org/abs/1602.05352)

The original V1 rule-based engine remains available. This experiment adds cached semantic representations and a bounded AI review, not a trained custom recommendation model. Further work such as viewport impression instrumentation, learned per-user coefficients and a complete new page-allocation algorithm is not silently bundled into this comparison.

## Selected configuration

Use `text-embedding-3-large` at 1024 dimensions for the opt-in `semantic` engine. The model comparison favored this over the initial small/512 setup on the real-metadata diagnostic pairs. Keep `baseline` as the default during the personal trial. Do not use `semantic_ai` as the normal feed engine: its additional latency did not demonstrate additional pairwise gains.

The saved profile is not capped by this experiment. Per-request work is bounded: 32 strongest direct semantic preferences, eight positive title examples, 384 candidate titles, and eight candidates for optional AI review. The existing structured scorer still uses the broader profile. These are operational limits, not a claim that the full history receives equal semantic attention.

Public metadata embeddings expire after 30 days and are capped at 5,000 entries. Private derived caches expire after seven days, are capped at 32 entries per user, and cascade on account deletion. Taste mutations invalidate private caches. A separate recommendation API-work allowance defaults to 15 preparations per user/day; fully cached matching does not consume it. Provider failures fall back without exposing errors or bypassing eligibility constraints.
