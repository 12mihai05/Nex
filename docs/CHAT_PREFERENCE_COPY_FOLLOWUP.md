# Chat preference routing and copying (2026-10-10)

The saved anime-related conversation confirmed two routing misses: `dont really
like` was not accepted by the declaration detector, and an explicit request to
exclude something from `my taste` was not recognized. Both reached recommendation
composition, whose acknowledgement did not represent a persisted Taste write.

## Fixes

- Recognize negative declarations with common intervening adverbs and explicit
  Taste corrections, retaining temporary/hypothetical/joking safeguards.
- Save before confirming. Failed/uncertain extraction does not fall through to
  recommendation cards or claim a successful update.
- Canonicalize anime/animes as a keyword, not the Animation genre, Japan, or
  Japanese language. Prompt instructions preserve explicitly allowed exceptions.
- An explicit keyword exclusion retained in the supporting statement excludes
  matching catalog-tagged recommendations, including Home and Pick. Ordinary
  dislikes remain soft signals. Exact title lookup still works. This does not
  claim to identify every untagged anime title. Existing Taste editing/removal
  remains the control; no duplicate blocklist/database migration added.
- Chat messages/confirmations and title synopsis, cast/crew and recommendation
  explanations support native selection/Copy. Knowledge answers use a selection
  area without removing source-link buttons.

## Verification

- 210 backend tests, typecheck/lint/build passed.
- 79 Flutter tests passed, 17 opt-in tests skipped; analyzer clean.
- Live OpenAI extraction of both reported statements passed: the correction
  produced only a negative anime keyword, not broader animation/country/language
  dislikes. Existing account preferences were not rewritten during diagnosis.
- Regression tests cover actual wording, save-vs-discovery routing, extraction
  failure, temporary statements, exact lookup, positive correction, anime vs
  cartoons/Japanese live action, and the Android selection Copy toolbar.

Structured output alone is not a semantic correctness guarantee; local routing
and scope checks remain necessary. Reference consulted:
https://developers.openai.com/api/docs/guides/structured-outputs

## Racing row diagnosis (no racing retrieval changes in this patch)

With RO and services 8/119/337/1899, movie discovery for `car race`, using the
existing minimum 80 votes, returned 17 titles. Pages 2 and 3 returned zero.
`car racing` and `auto racing` returned zero. `street race` returned nine titles,
including two absent from the original set; `motor sport` returned two other
titles. These are raw retrieval counts before availability hydration checks,
history/rating exclusions and cross-shelf deduplication, not proof of 20 eligible
personalized recommendations. Motorsport also includes motorcycle subjects and
must not be blindly merged into car-racing eligibility. The current query is
not exhaustive enough to claim no other relevant movies exist.
