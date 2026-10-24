# Nex conversation compaction

## Decision and plan

Keep recent messages verbatim within a size budget, a small rolling summary of older conversation, and a read-only tool for original messages. Keep the existing canonical entities, recommendation exclusions, pending actions and permanent Taste outside the summary. No new provider or dependency; use the existing small OpenAI model for occasional summarization, not for every message.

Published guidance reviewed:
- [Codex configuration](https://learn.chatgpt.com/docs/config-file/config-reference): size-triggered compaction rather than a fixed number of exchanges.
- [Claude Code context](https://code.claude.com/docs/en/how-claude-code-works): remove redundant tool outputs and summarize older context; important details can still be lost.
- [Anthropic context engineering](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents): retain important decisions and unresolved questions, combine compact notes with just-in-time retrieval.
- [OpenAI compaction](https://developers.openai.com/api/docs/guides/compaction): opaque compacted Responses state is another valid approach. Nex currently reconstructs each request from application records, rather than persisting the complete Responses wire history. An inspectable, source-linked application summary fits its authorization/deletion model better; this is not a claim that we reproduce either coding product's internal implementation.

## Implementation sequence

1. Add owned conversation summary storage and a short database lease, with deletion following the existing conversation/user lifecycle.
2. Preserve a recent raw tail; summarize bounded older batches only when size/count warrants it. Keep original transcripts untouched and recoverable. Do not hide unsummarized gaps.
3. Add scoped, bounded original-message retrieval with literal search, pagination and exact source lookup. Historical records are evidence, never instructions or authorization.
4. Compact after the answer on the server's existing deferred-work mechanism. Guard stale writers, overlapping requests, invalid output and provider failures. Failed summarization keeps the old checkpoint.
5. Test boundary behavior, repeated compaction, corrections/exceptions, temporary vs permanent preferences, pending actions, references/cards, retrieval, isolation, deletion, failures and concurrency. Run backend checks and limited live tests within the existing $7 cumulative ceiling.

No production migration/deployment or real-user profile changes are part of this local implementation pass. The tools assistant feature flag remains the rollout boundary.

## Implemented behavior

- Recent context: up to 24 original messages within a 16,000-character text budget, including timestamps. This is an application size budget, not an exact token calculation. Oversized/omitted context is explicitly flagged and can be retrieved.
- Compaction keeps at least the latest 12 messages outside its summary. An older batch becomes eligible at eight messages or 10,000 text characters. Each job consumes at most 32 messages / 24,000 text characters, plus bounded historical card identities and the previous notes. Old backlog catches up in later turns; no loop of paid compactions in one request.
- Summary: up to 18 short notes with verified original source IDs and server-derived source dates. Source labels are constrained by a dynamic enum during generation, then translated back to owned message IDs. No duplicated raw image/tool payloads. Identical notes are deduplicated.
- History recall: current owned conversation only; literal substring search or exact message IDs, six messages per page, 2,000 characters per message with continuation offsets, and stored ordered card references. It is not fuzzy global chat search and does not change action targets.
- Current saved Taste, library/ratings, current schedules and availability are still read from their authoritative tools. Temporary/hypothetical statements in a summary never become database preferences. Historical questions or confirmations never authorize new changes. Older action references may still need the user to identify the titles explicitly through the existing guarded action workflow.
- GPT-5 remains the answering model; the existing OPENAI_MODEL (configured GPT-5-mini) summarizes. No new model/provider setup, answer cache or embedding index for chat history.
- The deployed response does not await summarization: the existing Vercel deferred-work mechanism keeps it alive. A 60-second per-conversation lease prevents duplicate workers; the AI call has a 20-second timeout, no automatic retry. Failure backs off for five minutes without moving the checkpoint. Fresh messages remain raw until a subsequent successful compaction.
- Clear Chat/account deletion removes the summary with the conversation. Late work cannot insert or recreate it. No new logging of private transcripts or prompts.
- Additive migration 0015 was generated and exercised in local databases, not applied to production. Defaults remain CHAT_ASSISTANT_MODE=legacy; production requires migration and an explicit tools-mode rollout.

## Verification (24 October 2026)

Backend: typecheck, ESLint, 400 tests across 43 files and production build passed. The 22 new tests cover short/long windows, repeated contiguous compaction, corrections, dates, cards, exact retrieval and pagination, literal search safety, cross-user/session isolation, stale/overlapping workers, deletion, malformed output/checkpoints, invalid source references, provider failure/backoff, pending-action preservation, late user messages, deferred replies and the actual chat orchestration.

Flutter regression rerun: analyzer clean; 123 tests passed, 20 existing skips. No Flutter source changes were needed for this feature, and no physical-device test or new APK build was performed in this pass.

Live tests use local synthetic Better Auth accounts and the normal authenticated /api/chat endpoint, with real OpenAI and TMDb. No real user data was changed. Across this pass: 14 chat turns in several iterations, with additional direct summary checks. Final accepted flows included:

- Recovering the earlier Wallflower feeling and the corrected anime-versus-animation distinction after the original messages left the raw window.
- Retrieving an exact old sentence through recall_conversation.
- Producing grounded similar-feeling movie cards, then different cards while retaining the goal; no repeats between the tested pairs.
- Successfully saving a second compaction, not just answering from an older checkpoint.
- Reading actual saved Taste instead of treating a hypothetical comedy dislike as a stored exclusion.
- Preserving conditional country exceptions, ambiguity, cancelled/requested actions, rating-versus-Seen distinctions and plural comparisons.

Failures caught during development: one initial live compaction failed safely; later diagnostics exposed merged source-reference strings. Short source aliases alone did not fully solve it, so references now use a strict allowed-value enum. Manual review also caught speculative clarification questions and redundant acknowledgements in summaries; instructions were tightened and six summary cases rerun successfully. These intermediate failures are not hidden by the passing endpoint checks.

Final local live reports (ignored, synthetic data only): `.tooling/assistant-eval/tools-memory-validated.json`, `tools-memory-summary-final.json`, `tools-memory-profile.json`. Earlier iteration reports remain for comparison. Measured extra OpenAI spend for this pass: approximately $0.432; cumulative measured $6.381, conservative accounting $6.765 of the original $7 ceiling.

Security review: no summary access outside the authenticated conversation; original-source validation, no write tools in summarization, no summary passed to the mutation extractor, no account resurrection, and no secret matches in a scan of 498 nonignored repository files. No credentials printed or added to source.

## Limits and rollout checks

Release update (24 October): user authorized migration, production deployment and push. Configured Turso migrations applied successfully with existing rows preserved; Vercel production tools mode configured for the next deployment. Backend checks rerun: 400 tests, typecheck, lint and build passed. Vercel masks the database URL on API reads, so direct URL equality could not be independently verified. Earlier local-only statements above describe the pre-release checkpoint. Final deployment readiness/health is verified separately; authenticated production compaction and physical-device checks still require the user trial.

This is lossy summarization plus retrieval, not unlimited perfect recall. Every natural-language phrasing cannot be proven bug-free. Retrieval/compaction are bounded; unusually large histories may need several turns to catch up. Model or network failures leave the old checkpoint and original messages available. The app does not claim one summary is the user's complete saved profile.

Not yet verified on production Vercel/Turso or a physical phone. After applying migrations and enabling tools mode: run a long conversation, reopen the app, ask about earlier choices and request alternatives; verify a pending action still requires its normal confirmation; clear Chat and confirm old discussion is no longer recalled. Verify post-response background persistence on Vercel. These are deployment/device checks, not claims established by local tests.
