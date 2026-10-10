# Chat latency experiment and recommendation continuations

## Scope and decisions

Improve latency only through independent parallel reads and an experimental combined AI planner. No new response/catalog caches, reused AI answers, infrastructure, providers or models. Existing catalog caches and normal conversation memory remain unchanged. Never modify a real user's profile for QA.

Official OpenAI latency guidance informed the experiment: https://developers.openai.com/api/docs/guides/latency-optimization . Fewer calls are not automatically faster when a larger combined task needs more work.

Implementation extends the existing chat/session, recommendation and displayed-entity systems. No parallel profile or conversation store was added.

## Measurements

- Four alternating pairs of fresh Turso reads: sequential 829/568/554/543 ms; parallel 311/201/205/199 ms. Median 561 → 203 ms. Parallel reads enabled; this saves about 0.36 seconds in this part of the request, not seconds of AI generation.
- Initial stronger-model experiment: two rounds of eight synthetic intent scenarios, both variants with fresh model requests. Separate router/parser median 4523.5 ms, combined planner 4904.5 ms. Correctness assertions: 15/16 separate, 16/16 combined. Rejected this variant.
- Like-for-like experiment using the existing lightweight intent model in both paths: separate median 4345.5 ms, combined 2536 ms, 16/16 correctness checks for each. The same-model combined planner is enabled at the application entry point after the full-flow checks below. The separate path remains available to the comparison harness. These are small samples, not statistical guarantees, and full-response latency is not reduced by the same percentage.
- The separate-path failure exposed an occasional misreading of “Show all services.” Routing instructions now explicitly describe contextual suggestion buttons. Focused rerun: both separate cases and both combined cases passed.
- A live TMDB/OpenAI three-turn sequence retained Wallflower and its moods, with 21 distinct titles across three responses, no repeated cards. Measured responses: 27436/34841/26825 ms. Runtime refinement, topic reset and seven routing boundaries also passed. This is not evidence of a large end-to-end speedup.
- Final combined-planner sequence: 24 distinct titles across three responses at 20065/28525/21936 ms, original reference and moods retained. Runtime refinement, topic reset and all seven routing boundaries passed. Separate live checks of all seven suggestion messages preserved the reference, exclusions, providers and runtime except the requested change. Three repeated real-AI Taste clarification trials retained co-production scope without duplicate preferences or writes on confusion turns.

## Functional changes

- Discovery excludes titles already recommended in the same user's conversation before scoring and editorial review. A fresh conversation is independent. Exact title lookup remains allowed. Explicitly requesting previous suggestions permits repeats; it does not bypass normal eligibility checks or guarantee an identical carousel.
- Continuations request further provider pages while preserving the original reference and constraints. No forced filler or automatic relaxation when valid new matches run out.
- Fresh recommendation state still includes current Taste and library information. Temporary refinements do not write permanent preferences.
- Recommendation pills use a short, structured set of messages selected by the model. Each is separate and deduplicated. This prevents malformed generated labels, including merged options; it does not add deterministic natural-language intent routing. Library confirmation commands remain unchanged.
- Latest-response pills use the normal message/session path. Busy and stale pills are disabled; tapping a pill preserves an unfinished draft. Fixed a separate demo-action early return that left Chat busy.
- Evidence checks remain strict per recommended item. An unsupported selection is dropped without discarding independently verified selections in the same response. An all-invalid shortlist still produces no cards.
- Similar-feeling choices require an actual overview excerpt of at least 20 characters, not just a broad keyword such as friendship. This is grounding evidence, not a mathematical guarantee of subjective emotional similarity.

## Limits and verification

The reported stray Gamma glyph could not be reproduced. The client uses Dio JSON decoding, with no custom legacy-encoding conversion found. Do not strip legitimate Greek or other Unicode from ordinary text. Regression tests preserve Unicode prose while rejecting malformed suggestion labels.

Two initial live attempts failed at composition and safely showed no cards. Their original diagnostics only identified a generic Error, so their exact cause is not proven. Code inspection and a regression test established the separate all-or-nothing evidence-validation weakness described above. Do not claim every upstream error is solved.

Further exploratory runs exposed a legitimate empty shortlist and a too-strict test assertion: “under 110 minutes” sometimes became 109 rather than 110. The test now accepts either non-loosening convention; app behavior was not changed to satisfy the test. One separate-router run classified a film-inspired recipe request as conversation; the scope instructions now explicitly distinguish discussing a food scene from providing cooking instructions. The final combined routing run classified it out of scope. Clarified that country rules cannot promise majority-financing or primary-studio filtering.

Automated checks cover session ownership, no repetition across three rows, new-session isolation, explicit repeat allowance, empty results, unchanged Taste, narrow-screen pill layout, correct payload/session, draft retention and duplicate-tap prevention. Dark/light rendered suggestions were inspected. Physical Samsung testing is left to the user, as requested.

Production verification and final suite results are recorded after deployment below.

Pre-deployment checks: backend typecheck/lint and 250 tests passed; Flutter analyzer and 86 tests passed (17 opt-in tests skipped by the ordinary suite), plus two explicitly enabled dark/light visual tests; Android debug APK built successfully. Secrets scan found no configured credential values in scanned project artifacts. No physical-device run was performed.
