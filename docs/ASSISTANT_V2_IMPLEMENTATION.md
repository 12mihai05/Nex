# Assistant v2 implementation and rollout

Updated 24 October 2026. **Local release candidate, not deployed.** See ASSISTANT_V2_CHECKPOINT.md for verification and remaining deployment/device checks.

## Architecture implemented

- One model-led Responses loop chooses validated server tools. Existing OpenAI SDK retained; no Vercel AI SDK, gateway, Firebase, new provider or infrastructure subscription.
- Tools reuse Nex's catalog, Taste/ranking, libraries, EPG, releases and verified write workflows. No parallel replacement Taste database.
- Canonical recent entities, recommendation source/goal/filters and delivered IDs survive follow-ups. Context is isolated by authenticated user and conversation. “Others” retains scope and excludes earlier suggestions; a genuinely new request can change scope.
- Long conversations use dated, source-linked rolling notes plus a bounded recent raw window and a read-only original-history tool. Summaries never authorize writes or replace saved Taste. See CONVERSATION_MEMORY_IMPLEMENTATION.md for thresholds, failure behavior and verification.
- Watchlist/Seen/named-title requests use those actual sources. Incomplete pagination and unavailable metadata are explicit. Comparisons can discuss watched/unavailable titles without treating them as discovery recommendations.
- Single-title personal-fit discussions read Taste and receive title-specific rating/Seen/watchlist evidence with verified details. A saved title rating outweighs broad affinity; missing ratings or Seen markers do not imply dislike or definitely-unwatched. These are read-only predictions, not new preference evidence. Regional search-year discrepancies are verified against at most four strong canonical candidates, and ambiguous identities survive a clarification follow-up.
- Current emotional intent can outweigh ordinary long-term affinities; hard exclusions remain enforced. Latest-turn authorization guards durable Taste writes. Hypotheticals, read-back questions and temporary moods do not authorize changes.
- TV and release tools accept the main assistant's structured plan directly, avoiding redundant intent parsing. Broad TV requests can search all country channels, rolling-hour windows and verified title airings. Existing selection and write-safety helpers remain where useful.
- Independent reads run together; rounds/calls/deadlines are bounded. Public catalog caching remains. No cross-request AI-answer cache.
- Library/reminder changes still use confirmation previews. The model cannot execute confirmation tokens. Cancellation clears pending proposals, and completed write receipts survive later generation failures.
- JSON remains compatible with older clients. SSE gives Flutter actual work-phase updates. UUID idempotency prevents duplicate execution; interrupted work is not automatically resent. “Check saved reply” reads history instead.
- Current-news answers retain citations and appear once. Successful research is not followed by unsolicited additional research.
- Model/token/latency metrics exclude private prompts and secrets.
- A final selection-contract error permits one read-only answer correction, using only verified eligible IDs. It cannot rerun tools or repeat a write; invalid corrected IDs still fail closed.

GPT-5 remains the main model. The mini experiment was cheaper but did not justify its quality tradeoff. OPENAI_ASSISTANT_MODEL falls back to OPENAI_CHAT_MODEL, then OPENAI_MODEL.

## Controlled deployment sequence — not executed

1. Apply migrations through 0015 with `npm run db:migrate` from backend using securely configured deployment credentials. 0014 adds request tracking; 0015 adds owned conversation summary/lease columns. Both are additive and do not reset Taste/history. **Required before deploying this backend even with legacy mode.**
2. Deploy backend with CHAT_ASSISTANT_MODE=legacy; verify health, auth, JSON and authenticated SSE on Vercel.
3. Enable CHAT_ASSISTANT_MODE=tools for the private trial, using GPT-5 via the existing fallback or explicit override; redeploy.
4. Rebuild/run Flutter against that backend. Test device/network recovery and real reminder scheduling using the checkpoint checklist.
5. Roll back behavior with CHAT_ASSISTANT_MODE=legacy and redeploy. Do not drop the additive table/columns.

No remote migration, commit, push or deployment has occurred in this rewrite. Defaults remain legacy. A successful local build is not proof of deployed streaming or phone notifications.

## Reference

The bounded loop follows [OpenAI function-calling guidance](https://developers.openai.com/api/docs/guides/function-calling): clear tool contracts, application validation, grounded outputs and reasoning-item replay. These capabilities did not require adding an orchestration dependency.
