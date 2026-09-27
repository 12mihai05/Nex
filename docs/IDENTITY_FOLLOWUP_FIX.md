# Identity/memory follow-up diagnosis — September 27, 2026

## Root cause

The failing scenario first requested memory or identity films on the user's services, excluding superheroes, then asked: “Other options, under 110 minutes instead.”

The intent stage retained the original concepts correctly. Candidate generation and deterministic ranking also worked: the controlled diagnostic retrieved 30 candidates and retained nine eligible films. The final semantic editor, however, received only the latest short message, the candidates and their scoring reasons—not the resolved filters. It could not reliably know which story idea the follow-up referred to.

A paired real-TMDB/OpenAI diagnostic used the same nine ranked candidates. With only the follow-up message, composition returned no selections and a “Tell me the story idea/theme” quick action. With the resolved filters included, it selected eight grounded candidates. These included The Bourne Supremacy (108 minutes), Even If This Love Disappears Tonight (106), and 50 First Dates (99). This corrects the earlier report's attribution to a shortlist/retrieval limitation: this observed failure had eligible candidates and a missing-context boundary in composition.

## Scoped fix

Chat now passes its current guarded `FilterQuery` to `AiService.compose`. The existing composition request includes that bounded context and instructs the reviewer to use retained concepts, alternative/intersection semantics, moods and exclusions, without reintroducing replaced constraints. No full conversation history or new personal profile fields are sent.

The OpenAI Docs skill informed this explicit-context approach: generation calls are independent unless context is supplied. See [official conversation-state documentation](https://developers.openai.com/api/docs/guides/conversation-state). Nex retains `store: false`; no Responses storage or conversation service was introduced.

Models, API-call count, candidate generation, deterministic ranking, availability/runtime/language/seen/rating constraints and grounded-evidence validation are unchanged. The model may still honestly abstain when no supplied candidate supports a request. There is no forced nonempty response, hand-picked title insertion or special case for this persona.

## Verification

Three regression tests cover the serialized resolved context/privacy boundary, current replacement constraints with honest abstention, and forwarding from a real local conversation repository through Chat into composition. Full backend checks pass: 119 tests in 14 suites, typecheck, lint and production build. The unchanged Flutter response contract passes all 18 ordinary Flutter tests; the five opt-in tests were not rerun in this focused change.

The focused real identity/memory run passed both discovery turns and its complete mixed Seen/four-opinion/Want-to-see/Chat-action sequence; its synthetic account was removed. The formerly empty follow-up returned eight grounded candidates, including 50 First Dates, The Bourne Supremacy and Even If This Love Disappears Tonight, with the original topics, providers and exclusion retained. It also passed independently in the all-persona rerun. Existing exposure penalties favor alternatives but are not a strict ban on redisplaying a prior card; this patch does not change that policy.

Final all-persona rerun: **26/26 scenario assertion passes across 31 discovery turns**, zero failed scenarios. This includes two explicitly permitted abstentions and the correctly impossible runtime case; passing does not mean forcing every request to return movies. Three replies used the existing clearly labeled catalog-based composition fallback, so this is not claimed as successful live semantic editing on every turn. The formerly failing identity/memory follow-up used successful live composition in both reruns.

Evidence files are ignored `.tooling/verification/personas-identity-context-fixed.json` and `personas-context-regression-{0,1,2}.json`. The focused run includes mixed flags/actions; the all-26 rerun covers discovery and follow-up scenarios, not a second full mixed-state sweep.

Final audit found zero remaining synthetic verification accounts, zero foreign-key violations and zero out-of-retention EPG rows; migration count is unchanged at seven. The secret scanner checked 241 source/generated-text files, found no configured-secret matches and printed no values. No credentials, model configuration or infrastructure settings were changed.

This change fixes a concrete context-loss defect. It does not establish optimal subjective recommendation quality, eliminate catalog limitations or make model output deterministic. No deployment or mobile/UI changes were made.
