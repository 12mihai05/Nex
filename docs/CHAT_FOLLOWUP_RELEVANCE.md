# Chat follow-up and recommendation relevance

## Findings and approach

The router received recent messages, but catalog intent parsing and final recommendation composition did not. A request for the same feeling after a film discussion could therefore retrieve the user's general interests instead of that film's emotional experience. Similar-title requests also did not always trigger grounded editorial selection.

Taste extraction mixed conversation context with verbatim evidence requirements. A short answer could produce no accepted signal, and provider failures were reported as though the user had been unclear. A confused follow-up could then be routed back into extraction.

Extend the existing context and ranking pipeline, without adding another memory database or changing the user's saved profile:

- Pass bounded recent messages and existing entity references into intent parsing and composition.
- Resolve the referent before retrieval. Clarify ambiguous references; do not substitute generic movies on live parser failure.
- Retrieve the referenced title's related pool and requested concepts, without injecting unrelated favorite-source pools for similar-title requests.
- Review up to 32 eligible candidates for emotional similarity, retaining catalog-evidence checks and all availability/history/exclusion rules. An empty result is preferable to an unsupported match.
- Expand the related-title pool from six to up to 20 for explicit similarity requests only. Give the reviewer the resolved reference synopsis, require central-story/tone support rather than isolated mood adjectives, and allow evidence-validated ordering by request fit. Ordinary Home source limits and ranking remain unchanged.
- Give Taste extraction the original user evidence separately from dialogue context. Preserve spelling in supporting quotes and interpret clarification scope separately.
- Keep confused replies conversational, report extraction failure honestly, and reuse an existing combination's label when the same source statement is repeated.
- Use low rather than minimal reasoning on the configured routing model after live scope tests exposed temporary-preference and explanation-question errors. No model change or new provider.

Official OpenAI conversation-state guidance informed the context handoff: https://developers.openai.com/api/docs/guides/conversation-state. Application-owned history remains bounded and API storage remains disabled.

## Checks

- 245 backend tests passed, with typecheck, lint and production build.
- Secret scan: 1,139 files, no configured-secret matches.
- Live tests use synthetic profiles in an in-memory database, real OpenAI and real TMDB. No real user Taste, history, ratings or watchlist are modified.
- Exact screenshot wording is tested, including three clarification repetitions, a confused `What`, and a Wallflower follow-up while the synthetic user strongly likes racing.
- Existing live routing suite covers 11 request types plus multi-turn exclusions, country exceptions and ordinary discussion.
- Three repeated exact clarification exchanges passed, including no additional write after `What` and no duplicate combination for reworded labels. Seven contextual boundary scenarios passed. Runtime refinement retained the reference title; an explicit new mystery request cleared the reference and time limit.
- A qualitative review caught a nature-documentary/concert drift in an intermediate version, despite its no-Fast-and-Furious assertion passing. Reference-synopsis grounding and broader related retrieval were added instead of accepting that weak evaluation. The final live run led with The Fallout and Young Hearts, followed by other emotionally connected films; neither the racing franchise nor the documentary/concert drift appeared. These are qualitative candidates, not claims of identical emotional impact or age/content suitability.

## Limits

No finite test covers every possible message. Model routing remains probabilistic. Similarity depends on available catalog metadata and regional services. Live similarity requests observed take roughly 24–29 seconds end to end (final local-backend run 23.790 seconds); relevance is improved, but this is not an instant-response claim. Removing a saved preference still belongs in Your Taste; Chat should not promise an unsupported undo action. This is a backend-only change; no Flutter code or device installation changes are required.

## Production verification

Application commit `0dd5c63` deployed successfully in Vercel deployment `dpl_2ZoUBcBAWeWNxsxd7tTVkSYNn5g5`, including the phone's `https://nex-three-omega.vercel.app` alias.

The production smoke test passed with a disposable account:

- 126 Romanian guide channels, all with listings in the requested window.
- Exact screenshot exclusion request followed by `Yes coproductions remain eligible` returned a saved confirmation and persisted the scoped exception. The reply took 22.729 seconds in this run.
- Casual discussion and an unrelated coding request returned text without movie carousels.
- A new Wallflower discussion followed by the same-feeling request returned The Fallout, Young Hearts, The Hate U Give, Inside Out and Beautiful Boy, in that order. No racing franchise, nature documentary or concert film. Recommendation latency was 25.496 seconds.
- No unintended library/history/rating changes. The temporary account was deleted successfully.

No Flutter changes were required, so mobile builds and physical-device checks were not repeated for this backend-only patch. The user's existing profile was not rewritten.
