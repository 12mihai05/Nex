# Nex assistant: architecture review and proposed implementation

Date: 16 October 2026. Reviewed baseline: `2a426d4`.

Status: research and plan only. No application code, dependencies, environment settings, user data or deployments changed in this review.

## Decision

Replace the fragmented conversational orchestration, not Nex's entire backend or Taste system.

Build one bounded, model-led assistant that can call typed Nex tools, inspect their results, recover from an unsuccessful lookup, and answer naturally. Keep authentication, canonical identities, catalog/EPG repositories, deterministic eligibility checks, recommendation scoring, semantic personalization, and verified write transactions underneath it.

The assistant should choose how to obtain the answer. Application code must still decide what data it may access, whether an ID exists, whether a change is authorized, and whether an operation actually succeeded.

This is a proposed architecture, not a claim that an unbuilt replacement has already outperformed production. The recommendation is based on specific code limitations, local reproductions, and primary-source research. Release depends on comparative evaluation.

## 1. Scope and evidence

Inspected the specification, application entry point, Chat orchestration and prompts, knowledge/personal/TV/release/action handlers, conversation repositories, entity/reference handling, candidate retrieval, recommendation and semantic personalization, search ranking, Flutter Chat transport, existing tests, and prior verification/latency reports.

Later product decisions override obsolete parts of the original specification: preserve the separate Streaming/TV/Chat tabs, current weak-positive Seen rule, existing release notifications, and user-controlled Home refresh. Do not restore old UI or onboarding rules while changing Chat.

### Checks performed now

- All existing backend tests: **311 passed across 38 files**. The first sandbox run could not spawn a build helper; the same suite passed outside that restriction.
- Synthetic reproduction using the real `ChatKnowledge.handle`: a stubbed provider supplied the correct **Cruella (2021)** result for **Cruela**, yet the handler returned “Please specify the movie or series and year.” No live provider was involved.
- Synthetic reproduction using the real `generateCandidates`: ten watchlist records, with other candidate sources empty, produced only six hydrated watchlist candidates.
- Synthetic reproduction using the real `AiService.compose` with a fake model client: both an empty model selection and rejected non-verbatim evidence produced the identical “couldn't confirm a match” fallback.

These reproduce application behavior, not the historical model outputs. No production conversation logs, personal library contents, live OpenAI requests, or new latency samples were collected. Flutter was inspected but not rerun for this planning-only task.

### Why passing tests did not catch the screenshots

Many relevant tests stub `routeChat`, `planTv`, `knowledgeSubject` or composition. They correctly verify authorization, transactions and downstream behavior, but often give the application the interpretation we wish the model had produced. They cannot establish natural-language success across an actual multi-turn conversation.

## 2. What is wrong in the current design

### A. Reading a watchlist and recommending from it are separate capabilities

`chat-personal.ts` can read a library page, but sends the model title/type records without canonical title IDs or descriptive metadata. It stores the read plan, not a reusable candidate set. `FilterQuery` has no explicit `watchlist` or `explicit_titles` source scope. General retrieval in `candidates.ts` adds only `state.saved.slice(0,6)` alongside unrelated discovery sources.

Therefore “yes, I can see your watchlist” does not mean the next recommendation call can select across that watchlist. The screenshot's request is reasonable; asking the user to loosen unspecified constraints is not a useful response.

Relevant code: `backend/src/services/chat-personal.ts`, `backend/src/services/candidates.ts`, `backend/src/domain/types.ts`, `backend/src/services/chat.ts`.

### B. Comparison is being forced through single-title workflows

`knowledgeSubject` returns one query. `ChatKnowledge` resolves one entity and retrieves one title/person's facts. There is no first-class comparison task or retained comparison set for “those two plus Cruella.” The reference helper also returns one selected entity.

If routed to discovery, “which of these two?” is not constrained to those two IDs. If routed to knowledge, it still lacks a plural subject contract. Prompt wording alone cannot reliably repair missing task semantics.

Relevant code: `backend/src/services/ai.ts`, `backend/src/services/chat-knowledge.ts`, `backend/src/services/chat-reference.ts`.

### C. Search quality is discarded after retrieval

Nex already has forgiving search ranking. Chat subsequently requires exact normalized equality with the displayed or original title. This defeats plausible typo matches and can discard provider-supported aliases. It also conflates no result with ambiguity.

TMDB documents that its text search considers original, translated and alternative names. We should preserve that evidence instead of requiring every successful alias to equal the main title. [TMDB finding data](https://developer.themoviedb.org/docs/finding-data)

### D. Different failures collapse into one misleading answer

`AiService.compose` reviews at most 12 candidates, or 32 for similarity. It sends truncated overviews and keywords, not complete title facts. For concept review, selections need an exact supporting excerpt. Similarity adds an overview-only, minimum-length rule. Rejected selections are dropped individually, but if none survives, application code replaces the answer with the screenshot's generic fallback.

The same visible result can mean empty retrieval, over-filtering, a weak shortlist, insufficient descriptive evidence, or malformed evidence. It does not prove the user supplied impossible constraints. There is no bounded recovery step to inspect why the shortlist failed.

Keep factual grounding. Replace the blanket error and brittle proxy for recommendation quality. A verbatim phrase proves that text was present; it does not, by itself, prove emotional similarity. Conversely, a paraphrase failing the substring check does not prove a recommendation was bad.

Relevant code: `backend/src/services/ai.ts:208`, `backend/src/services/grounded-selection.ts`, `backend/src/services/chat.ts:215`.

### E. Visible history and usable conversational memory differ

The conversation is persisted, but most model calls see only eight recent messages, each truncated to 2,000 characters. Displayed references normally come from the latest card group. Working session context expires after 12 hours. Some specialized calls receive only the latest message, even when the outer router saw history.

This does not prove the 12-hour timeout caused an immediate follow-up failure. It does show why storing the transcript alone does not guarantee usable memory. Text-only mentions, multiple subjects, an earlier unanswered request and the last carousel need separate identities.

Relevant code: `backend/src/repositories/user-repository.ts:419`, `backend/src/domain/entities.ts`, `backend/src/services/chat-knowledge.ts`.

### F. Too many boundaries can lose intent and add latency

The production entry point enables the combined planner, so a recommendation normally already avoids a separate router-plus-filter call. Nevertheless, personal and knowledge paths commonly require routing, another interpretation call, then composition. Compound requests add a task planner and run handlers sequentially. Read-only facts are sometimes fetched repeatedly. Flutter waits for the complete JSON response.

There are also semantic regex overrides after model interpretation. Deterministic validation is essential; English keyword rules that replace contextual understanding should not be the general conversational engine.

Prior repository reports recorded selected full recommendation turns around 20–35 seconds, with deployed examples around 25–29 seconds. Those are historical small samples, not today's measured baseline. An unrestricted agent loop could make latency worse, so reducing orchestration calls must be measured, not assumed.

Relevant code: `backend/src/app.ts`, `backend/src/services/chat.ts`, `backend/src/services/intent-guards.ts`, `mobile/lib/src/data/api_client.dart:172`; historical measurements in `docs/CHAT_LATENCY_AND_CONTINUATIONS.md`.

### G. The old TV screenshot needs separate treatment

Current code already includes same-channel next-programme handling, off-air filtering and a checked 48-hour fallback. Tests cover these with a mocked planner. It would be inaccurate to claim the screenshot proves those current branches still fail, or that PPV2 necessarily has a missing real listing today.

The replacement must retain these safeguards and evaluate the real language interpretation. A genuine source gap must be reported as a source gap, not hidden by switching channels or inventing a programme.

## 3. Proposed assistant architecture

### One conversational controller, existing domain services

Use the existing OpenAI Responses integration. Replace the mandatory route-to-specialist conversation chain with a small tool-execution loop:

1. Authenticate and load a compact conversation/task state.
2. Let the model answer directly when no external facts are needed, or request typed Nex tools.
3. Run independent reads concurrently, with bounded fan-out.
4. Return verified results and explicit status codes to the same conversation.
5. Let the model finish, ask one necessary question, or make a bounded recovery request.
6. Validate final card references and action receipts before displaying them.

Use strict function schemas. Schema correctness does not establish factual truth or permission; server validation remains mandatory. [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)

Keep the first implementation small: one assistant, not a team of AI agents. Initial limits to evaluate: at most three tool rounds, eight tool invocations and an overall deadline, with per-tool timeouts and smaller limits for ordinary requests. These are starting engineering limits, not promised response times. Batch-oriented tools should make normal tasks require fewer rounds.

Do not replace the current sprawling router with an equally sprawling framework. Direct API composition is a reasonable starting point; agentic flexibility carries latency and cost trade-offs. [Anthropic architecture guidance](https://www.anthropic.com/engineering/building-effective-agents)

### Task-oriented tools

Expose a compact set with clear, non-overlapping responsibilities, backed by current services:

- **Resolve titles/people:** batch names and references; return canonical IDs, match evidence and ambiguity candidates.
- **Read title facts:** batch details, credits, seasons, availability and release information, requesting only needed fields.
- **Read my data:** Taste, library membership/listing, reminders, settings. All ownership comes from the authenticated session.
- **Recommend:** explicit source scope of catalog, watchlist, history or supplied IDs; current goal, hard constraints, soft preferences and continuation state.
- **TV guide:** current/next/window/title airings/channel information, returning coverage and source freshness.
- **Release information:** reuse the current TMDB/release tracking path.
- **Entertainment web lookup:** use the existing OpenAI web capability only where current/unsupported structured facts require it; keep private profile contents out of web queries.
- **Prepare changes:** typed library, reminder and Taste proposals backed by the current validation/transaction mechanisms.

Comparison should be a natural answer over several resolved titles and relevant Taste, not another independent AI specialist. The model can ask for the facts of three films in one tool call.

Tools should return `ok`, `partial`, `no_results`, `ambiguous`, `unavailable` or `needs_confirmation`, with canonical records, coverage, provenance and safe recovery options. Do not pass raw SQL access, arbitrary URLs or administrative credentials to the model.

### Shared conversational state

Extend the existing entity and conversation tables rather than create a parallel memory service. Persist a versioned compact state containing:

- Active task and source scope: for example, choosing from this user's watchlist.
- Named entity set: two comparison titles, then the third added later.
- Ordered result groups linked to message IDs, for “the second one” and “those three.”
- Temporary constraints and their originating message; explicit reset/correction behavior.
- Pending clarification or write proposal, including exactly what remains unresolved.
- Already-shown IDs scoped to the active recommendation request, not an unlimited global ban across unrelated topics.
- Verified facts as references with freshness, not copied permanent truth.

Use recent turns plus this state and targeted older-message retrieval. Do not put the entire library or thousands of Taste signals in every prompt. Compact longer history only when a token threshold is reached, preserving source message references. A summary must not manufacture authorization or a preference.

On reopening Chat, restore the task and subjects from persisted context; refresh time-sensitive data. “Tonight” must not silently mean last week's date. Expired action proposals remain expired even when conversational context survives. Clearing Chat deletes the added context too; account deletion must cover all new user-owned records.

Manual conversation-state management can retain the existing `store:false` approach. A provider-hosted conversation store is not required. This flag alone is not a promise of zero provider retention. [OpenAI conversation state](https://developers.openai.com/api/docs/guides/conversation-state)

### Better title resolution without unsafe guesses

Resolve each named or referenced subject into a canonical entity. Reuse normalized/token/edit-distance/provider ranking, preserve exact-match precedence, and consider year/type/context. Do not require a year for an otherwise unique, high-confidence read-only match.

For “Cruela,” use Cruella if the retrieved result is clearly dominant; show the canonical name. If two remakes are plausible, offer compact choices. If a write depends on an uncertain match, require title selection before constructing the confirmed transaction. Reading/comparing is lower risk than modifying the wrong library entry.

### Natural answers, not ungrounded improvisation

Lead with the requested outcome. A choice question should receive a choice and a useful reason. A comparison should address every named film. Discussion should not automatically create a carousel or ask another question.

Keep facts, interpretations and preference inferences distinct. The assistant may explain that one supplied premise seems closer to the requested mood without pretending mood is an objective guarantee. Availability, cast, broadcast times and saved changes must come from verified records. Spoilers stay opt-in. Keep the user's existing English-language product preference; do not change language policy silently.

Suggestions should be optional, task-relevant and linked to the current request state. “Show all services” is inappropriate after a TV schedule gap unless there is a genuinely related streaming alternative. Tapping a pill must use the same conversation path as typing its equivalent.

## 4. Recommendation and Taste improvements

### Preserve the existing foundation

Do not erase ratings, Seen, watchlist, explicit preferences, semantic vectors or conditional exclusions. The existing retrieval → scoring → reranking architecture is a sound foundation; that three-stage separation is also standard recommender practice. [Google recommendation overview](https://developers.google.com/machine-learning/recommendation/overview/types)

The immediate weaknesses are candidate scope and task relevance, not evidence that every Taste coefficient needs replacement.

### Make the request govern retrieval

For **from my watchlist**, use the eligible watchlist as the candidate universe. Rank compact records server-side, progressively hydrate missing metadata with controlled concurrency, and fetch detailed facts for the finalists. Do not sample six items or ask the user to manually page through the library. For a very large or incompletely hydrated library, report partial coverage honestly instead of claiming the winner is the best across unseen records.

Distinguish **from my watchlist** from **based on my watchlist**. The former limits candidates to saved titles; the latter can use saved titles as examples for new discoveries. Use conversation context and a brief stated interpretation when it is low-risk; ask only when the distinction materially prevents a useful answer.

For **which of these two/three**, keep the named set intact. Retrieve their availability, but do not hide a named film just because it fails discovery defaults. Discuss missing availability accurately. Explicit comparison is not permission to change exclusions or ratings.

For **same feeling**, retain the original reference plus the desired emotional qualities, and use related-title/keyword/genre discovery as multiple candidate sources. A temporary request embedding over the bounded candidate pool can complement existing semantic Taste scoring; it does not search all of TMDB. Compare this experimentally against the current approach, reusing existing vectors where already available and not introducing a new embedding model or vector database by default.

Conversational-recommendation research supports treating the conversation itself as a retrieval query rather than relying only on static profile information. This is supporting evidence, not proof of a particular gain for Nex. [Conversational recommendation as retrieval](https://aclanthology.org/2023.nlp4convai-1.13/)

### Separate requirements from degrees of fit

Keep explicit hard exclusions, selected country, verified availability requirements and concrete runtime bounds enforceable. Keep mood, tone, themes and emotional similarity primarily as relevance signals unless the user truly makes a supported attribute mandatory. Unknown metadata is not proof of either a match or a violation.

Give the current request priority; use durable Taste to choose among suitable candidates. A preference for racing must not pull Fast & Furious into a request for the emotional experience of Wallflower. Conversely, do not permanently learn a new preference from a one-night request or a mere comparison.

Use evidence-aware reranking, not a separate mandatory judge call for every message. Supply the relevant title facts, desired facets and applicable preference evidence together. Keep deterministic validation of IDs and factual fields. If evidence is insufficient, retrieve more before concluding no match. When no matches genuinely satisfy hard constraints, explain the actual obstacle and offer one relevant relaxation; never apply it silently.

For “other recommendations,” paginate/expand the same search, exclude prior results in that request, and preserve its constraints. Report exhaustion rather than returning almost the same list. Reuse existing diversity controls, with stronger diversity for broad discovery and lighter diversity for a precise similarity request. [Google reranking guidance](https://developers.google.com/machine-learning/recommendation/dnn/re-ranking)

### What not to add now

No whole-TMDB mirror, paid vector database, public-review scraping, custom reinforcement learning, collaborative filtering trained on a handful of friends, multi-agent recommendation debate, or self-hosted large model. Those require data, operating capacity or complexity not justified by these failures. No new third-party service without approval.

A longer conversation is not automatically better personalization. Published evaluations have observed recommendation quality degrading across additional preference turns in some systems. Test whole conversations and corrections, not only initial answers. [COLING 2025 study](https://aclanthology.org/2025.coling-main.561/)

## 5. Speed, cost and model selection

First measure authentication/database reads, model planning, provider search, title hydration, semantic work, response generation and serialization separately. Capture p50/p95 end-to-end latency, time to first useful content, tool rounds, input/output usage, and cost per successfully completed task.

Use the local configured `gpt-5-mini` and `gpt-5` as the baseline, not an assumption about production settings. Compare:

1. Current orchestration with current models.
2. The existing workflow with the corrected source scopes, entity resolution and context adapters, to test whether a smaller repair is sufficient.
3. New bounded assistant with the lightweight model.
4. New bounded assistant with the stronger model.

Only if useful afterward, test selective escalation against the delay/cost of the additional call. If the repaired existing workflow meets the same quality bar more simply and cheaply, keep it. The bounded assistant is the leading proposal, not a reason to ignore a successful simpler baseline.

Prefer the least expensive configuration that meets the quality gate. Do not automatically run a weak model followed by a stronger reviewer on every turn. Test supported reasoning levels; more reasoning cannot compensate for missing library access or a discarded entity. Check current account availability and pricing before any future model switch. [OpenAI model selection](https://developers.openai.com/api/docs/guides/model-selection)

Performance work should remove redundant calls, batch title lookups, parallelize independent reads, reuse an authenticated request-scoped data snapshot, and avoid unnecessary payloads. Add streaming for actual progress and answer text after relevant facts are available. Streaming improves responsiveness but does not excuse slow retrieval. [OpenAI latency guidance](https://developers.openai.com/api/docs/guides/latency-optimization)

Do not introduce response caching or replay old AI answers. Preserve existing public metadata/embedding caches with their freshness rules; any new caching policy needs a separate decision. Confirmation receipts are idempotency records, not cached conversational answers.

Provisional performance goals, to validate against the real baseline: ordinary one-tool answers at roughly 5–8 seconds median and richer discovery at roughly 8–12 seconds median; p95 and cost must not regress unnoticed. These are stretch targets, not promises. If they are infeasible on the selected models, report the measured quality/speed trade-off and choose explicitly.

Keep existing per-user quotas and add bounded per-turn token/tool budgets and concurrent-request controls. A message quota alone no longer bounds cost when a turn can run several tool rounds.

## 6. Open-source/framework decision

**Recommended initially: the existing OpenAI SDK and a small, explicit runner.** Nex already uses Responses, Zod and Hono. Keep the orchestration inspectable and the current database authoritative. Implement only the loop, typed tools, state lifecycle and streaming contract needed for Nex.

**Vercel AI SDK:** a credible alternative for loop control and streaming, not an intelligence upgrade. Evaluate it only if it reduces tested implementation complexity. Flutter still needs its own stream consumer, so web UI helpers do not eliminate that work. Its library is Apache-2.0; no managed gateway is required by this proposal. [Loop controls](https://ai-sdk.dev/docs/agents/loop-control), [license](https://github.com/vercel/ai/blob/main/LICENSE)

**OpenAI Agents SDK:** another candidate for a maintained tool-loop implementation. Check version compatibility, state/streaming fit and telemetry before adoption. A framework must not quietly export private conversation traces or add a second authoritative conversation store. The same domain tools and evaluation suite should work regardless of runner.

**LangGraph:** useful if Nex later needs durable, long-running branched workflows. For short mobile conversations with existing Turso state and confirmation transactions, introducing graph checkpoints now adds integration work without addressing missing tool semantics by itself. Its JavaScript library is MIT-licensed. [Overview](https://docs.langchain.com/oss/javascript/langgraph/overview), [license](https://github.com/langchain-ai/langgraphjs/blob/main/LICENSE)

Do not add an external memory product or hosted observability platform. The first evaluation runner can extend existing Vitest/TypeScript scripts; a new evaluation SaaS is unnecessary.

## 7. Safety and operational boundaries

- Derive the user ID exclusively from Better Auth; every tool enforces ownership. Model arguments never authorize access to another account.
- Treat EPG, TMDB, web text and stored summaries as untrusted data, never instructions. Do not expose arbitrary fetch/SQL/shell tools.
- Keep existing library/reminder/edit confirmation previews, stale-plan checks and idempotent transactions. Do not claim “saved” until a receipt exists.
- Retain conservative learning from clear durable preference statements. Temporary moods, confusion, jokes and questions do not authorize permanent changes. A broad/destructive Taste edit needs an exact preview.
- Serialize writes per conversation or use optimistic version checks. Validate the proposal against current state at commit time.
- Handle stream disconnects, retries, double taps, app restart and cancellation without duplicate changes. Stable request IDs and replayable receipts are required before streaming writes.
- Server-saved reminders are not proof that Android has scheduled a notification. Preserve the mobile reconciliation/permission contract.
- Log sanitized timings, stages, status and rejection categories by default, not credentials, bearer tokens, full private profiles or raw user messages. Keep detailed evaluation traces restricted to synthetic test data unless the user approves real examples.
- User-visible progress describes actual operations, not hidden model reasoning. Do not collect or display chain-of-thought as an observability mechanism.
- Bound retries and provider fan-out. Partial data must remain distinguishable from a genuinely empty result.

## 8. Implementation sequence and exit gates

### Phase 1: establish a reproducible baseline

Turn the supplied conversations into multi-turn scenarios using disposable test users. Add stage/status diagnostics and deterministic failure-injection tests. Record actual production-model configuration without exposing values other than model names. Preserve baseline measurements and a held-out set before tuning.

Exit: failures classified as understanding, entity resolution, retrieval, filtering, composition or data coverage; not one generic empty result.

### Phase 2: correct task semantics and tool contracts

Add source-scoped recommendation, whole-library server-side ranking, plural entity resolution and comparison facts. Reuse current services and canonical IDs. Make strict eligibility and soft relevance explicit. Preserve Home/Pick behavior behind existing interfaces.

Exit: library scope and named-set coverage pass deterministic tests, including typos, missing metadata, remakes and large libraries.

### Phase 3: introduce the bounded assistant and persistent task state

Add versioned state, tool schemas, runner limits and recovery. Replace specialist prompt chains incrementally behind a feature flag. Keep old API/block contracts operational. Migrate old conversations lazily; do not reset Taste or require users to re-rate anything.

Exit: screenshot conversations complete without forced rephrasing; source context survives more/plus/that/no/topic changes; writes remain verified and isolated.

### Phase 4: natural response delivery and efficiency

Add backward-compatible streaming, validated cards and exact action receipts; improve context-specific suggestion pills. Optimize measured bottlenecks and compare model/reasoning variants. Maintain selectable text and current theme/UI conventions.

Exit: useful-progress latency improves, final-task latency and cost are reported, interrupted requests recover safely, old mobile clients still work during rollout.

### Phase 5: full evaluation and controlled rollout

Run old/new comparisons against the same synthetic profiles, catalog snapshots and clock for reproducibility, then a separate live-provider suite. Enable for a test account first. Shadow only reads if needed; never execute writes twice. Keep a rollback flag and backward-compatible schema until validated. Deploy only after approval of this plan and implementation verification.

## 9. Evaluation specification

Start with about 80 multi-turn scenarios, plus generated paraphrases and a held-out set. Repeat critical conversations at least three times with fresh model calls. Increase the set as failures appear; this is not a claim to cover every possible message.

Required families:

1. Watchlist-only recommendations, new suggestions based on watchlist, empty/large libraries, partial metadata and provider restrictions.
2. Moneyball versus The Greatest Game Ever Played; add “Cruela”; remove one; ask for one final choice; preserve all subjects.
3. Wallflower discussion → same feeling → other recommendations → runtime change → new topic. Check relevance and no repeated cards within the request.
4. “This/that/the second one/those two,” text-only references, multiple carousels, reopening after 12 hours, and context beyond eight messages.
5. Durable likes/dislikes, tonight-only constraints, compound preferences, country/co-production exceptions, anime versus animation, and explicit corrections.
6. Mixed read/write requests, confirmation/cancellation, repeated confirmations, stale plans, ambiguous names and bulk action completeness.
7. TV now/next/tonight, PPV1 versus PPV2, off-air listings, missing coverage, cross-midnight times and explicit other countries.
8. Cast/crew/episode follow-ups, factual comparisons, thematic discussion, spoilers and uncertain interpretations.
9. Upcoming cinema dates, delayed releases, season announcements, current-news sourcing and absent dates.
10. English/Romanian wording, ordinary typos, short replies, corrections and deliberately ambiguous requests.
11. Out-of-scope requests, malicious instructions inside provider text, cross-user references and attempted unconfirmed writes.
12. OpenAI/TMDB/EPG/database timeouts, malformed tool responses, concurrent messages, disconnects and retry idempotency.

Scoring must combine deterministic assertions with blinded answer review. An AI judge may assist, but cannot be the only judge of correctness or personal relevance. Measure retrieval coverage separately from ranking quality and answer quality. [OpenAI evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices)

Release gates:

- Zero observed cross-user access, unconfirmed library/reminder changes, duplicate commits, invented IDs or false save confirmations in the safety suite.
- Every explicit comparison subject accounted for, or a specific ambiguity explained.
- Watchlist-only recommendations contain only eligible saved IDs; no silent six-title sampling.
- All supplied screenshot regression scenarios pass repeated trials. Historical PPV2 behavior is tested with both complete and incomplete schedule fixtures, then live coverage when available.
- At least 95% task completion on the defined ordinary-task evaluation set, with no material regression in any capability family. This is a test-set target, not a guarantee about all future users.
- Zero unintended repeated recommendation IDs while continuing a request; honest exhaustion when the pool is depleted.
- Every hard constraint and known explicit exclusion retained unless the user changes it.
- Blinded relevance review favors the replacement overall; no acceptance based only on fluent prose or more returned titles.
- Report p50/p95 latency, tool calls, token usage, cost per successful task and sample size. No hidden cost increase beyond the agreed budget.
- Backend typecheck/lint/tests, Flutter analyzer/tests, live authenticated endpoint tests and phone checks pass before rollout. Physical device checks can remain the user's final step, as previously requested.

## 10. What success should feel like

“Pick from my watchlist” should produce a grounded choice from the user's saved options, not an unrelated discovery search. “Compare those two plus Cruella” should extend the existing comparison without making the user retype everything. “Give me others with the same feeling” should preserve the actual request, return different suitable titles, and say plainly when the source cannot support more.

The intended improvement is better access to the right data, coherent task memory, fewer avoidable handoffs and measured model choice. It is not a promise of a perfect chatbot, nor a reason to discard the personalization work already done.
