# Chat capability pass — 2026-10-14

Extend the existing handlers, repositories, session context and UI blocks. No new service, agent framework, user-data cache or model migration.

## Research decisions

- Multi-task requests: bounded structured plans, existing verified handlers, sequential dependencies and explicit incomplete-task reporting. A model proposes intent, never arbitrary SQL or URLs. Preserve write confirmations and original user evidence. [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling).
- References and temporary preferences: store canonical identities, pending clarification and task-scoped constraints in the existing expiring user-owned context. Avoid replaying unrelated stale state. [Conversation state](https://developers.openai.com/api/docs/guides/conversation-state).
- Taste correction: exact saved targets, preview, explicit confirmation, stale-state detection and transactional changes. No deletion inferred from a question. [Human review](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals).
- Explanations: retrieve recorded ranking evidence rather than asking a model to justify a title after the fact. If absent, say so. Clarification/recovery must communicate limitations and keep the user in control. [Microsoft HAI guidelines](https://www.microsoft.com/en-us/research/blog/guidelines-for-human-ai-interaction-design/).
- Channels: summarize verified schedule samples, not an invented channel biography; use the existing web search with citations for official channel identity. Distinguish observed programming from enduring channel identity.
- Releases: reuse country-specific TMDB release functions; theatrical, digital, episode and season dates are distinct. Confirm announcements through existing cited web search when necessary. Unknown date does not mean cancelled. [Release dates](https://developer.themoviedb.org/reference/movie-release-dates), [regions](https://developer.themoviedb.org/docs/region-support), [seasons](https://developer.themoviedb.org/reference/tv-season-details).
- Pagination: preserve query/country/time constraints and exclude delivered IDs. Bound one response, not the total accessible dataset. Never silently broaden constraints to fill results.

## Implementation and verification order

1. Shared extension plans, release/channel readers, canonical contextual references.
2. Grounded recommendation explanations and confirmed Taste correction/removal.
3. Bounded compound requests reusing existing handlers; no duplicate writes or recursive planning.
4. Continuation, temporary-context and failure recovery regression coverage; readable UI controls using existing blocks.
5. Full backend/Flutter checks, real AI synthetic cases, production verification with disposable accounts only, deployment and limitations report.

Required regressions: stale/replayed/cross-user confirmations; multi-request omissions; ambiguous titles/channels; missing source data versus failed source; no repeats; unavailable local release dates; original premiere versus local availability; temporary preferences never written to Taste; exact explanation evidence; spoiler-safe answers; source injection treated as data.
