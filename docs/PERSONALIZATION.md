# Personalization model (Phase 15)

## Audit outcome

The original implementation stored feedback but did not feed it into the profile; read no saved temporary context when ranking; treated watched as slightly positive; ranked one generic discover pool; conflated movie and series IDs; and rendered hard-coded taste explanations and demo Browse data in live mode. Those were functional defects, not reasons to introduce ML infrastructure. The changes retain a small content-based recommender with inspectable evidence.

## What Nex knows and how it learns

**September 27 current policy:** Want to see reuses the watchlist but no longer writes durable taste evidence. Trusted genre/keyword snapshots supply at most 0.20 affinity, compared with 0.12 for unrated Seen. The two weak contributions do not stack. Explicit opinions (including Meh) suppress the same title's weak hints; removing flags reverses them and disabling behavioral personalization disables both. Legacy watchlist evidence is ignored when reading taste. Earlier `.35` watchlist evidence weights below describe the prior implementation, not the current learner. Old saved rows without trait snapshots remain usable as saved-title candidates but do not invent inferred traits; saving again hydrates them.

Backend state is fresh for subsequent recommendations and Chat requests. Flutter updates saved/seen/opinion counts immediately after successful writes, refreshes taste insights without reranking, and restores Chat-created flags. Its current Streaming snapshot remains stable until explicit refresh or five-minute expiry on re-entry; already seen/rated titles are removed immediately. See TV_FAVORITES_REFRESH_RESULTS.md for regression evidence and limitations. Weak behavior is never displayed as an explicit Like.

Explicit genre/mood selections, free-text lasting preferences, and direct Your Taste corrections become durable dimensions. Favorite titles, Like, Super Like, Dislike, and Watchlist contribute only catalog-supported genres, keywords, major cast, director, original language, decade, format, country and collection. The title metadata is hydrated by the backend rather than trusting client snapshots. Unsupported pacing, psychological traits, gore tolerances, humor styles and other dimensions are not invented from missing catalog data. An explicit user statement can be retained even when a catalog has insufficient matching metadata; it must not produce a fabricated match explanation.

Every preference retains score, confidence, evidence count, source set, explicit/inferred evidence flags, last evidence time, and update time. The additive migration preserves existing rows. Legacy scores remain readable until new evidence is added. Evidence stores source identifiers and timestamps, not raw conversations, and is bounded to the latest 64 entries per dimension. Repeating the same title reaction replaces the same evidence identifier, preventing unlimited reinforcement by repeated taps.

Sources are explicit when the underlying action is a declaration or reaction, and inferred for Watchlist/weak behavior. A title reaction is explicit evidence about the title; its extrapolation to a genre/director is still an inference. Therefore reliability discounts are .75 for genres, .5 for keywords/mood/collection, .3 for directors, .2 for actors, and .1 for language/decade/format/country. One disliked movie should not make all English-language movies undesirable.

Evidence mass uses understandable ordinal strengths: Super Like/Dislike 2, Like/favorite 1.3, Watchlist .35, search .015 and detail open .01. Watched is zero. Direct declarations/corrections use mass 3 and override inferred evidence for the same dimension. Score is a weighted mean; confidence is mass/(mass+1). This is a saturation heuristic, not a probability of enjoyment or statistically calibrated certainty. Scores stay internal.

Inferred evidence has a 60-day half-life, evaluated when reading the profile. Explicit evidence does not decay automatically; a new direct correction replaces the old direct statement. Weak search/detail weights are defined for future adapters, but these interactions currently do not train the profile at all. This deliberately avoids interpreting curiosity as approval. Turning off behavior personalization stops Watchlist-derived learning; explicit feedback still works.

## Current intent

### Seen history and opinion (September 27 update)

Viewing status and opinion are independent. No history entry means unspecified, not known-unseen; no rating means unrated, not Meh. Any rated title is treated as familiar for default discovery without manufacturing watched history. Exact lookup remains available.

Per the user's later approved rule, unrated seen titles now supply a separate low-confidence history affinity, not an explicit Like or durable declared taste. Trusted genre/keyword snapshots are stored in `watch_history.traits_json`. Matching candidate affinity is capped at 0.12 total regardless of library size. Explicit negative matching taste suppresses this nudge; normal explicit Like evidence is substantially stronger. Every explicit opinion, including Meh, removes that title from the history-hint pool. Clearing the opinion restores the hint if still seen. Removing seen removes the hint. Behavioral personalization off disables it. Older history rows with no trait snapshot remain neutral until refreshed.

Meh clears prior reaction-derived evidence without creating broad negative taste. Explicit reactions suppress weak watchlist-derived evidence from that same title. Feedback and evidence updates are transactional; history undo never clears opinion. The mobile client restores reactions after sign-in, retains every history title snapshot (rather than only 30 hydrated entries), and exposes adjacent seen/opinion controls with independent clearing.

The weak-history approach is informed by the distinction between noisy implicit behavior and explicit preference in [Hu, Koren and Volinsky](https://yifanhu.net/PUB/cf.pdf). The 0.12 cap is a Nex engineering hypothesis, not a value established by that paper. Earlier statements below describing watched as wholly neutral refer to the prior policy; watched still never creates an explicit positive rating.

Conversation context is separate, owned by the authenticated user, and expires after 12 hours. Current moods, exclusions and runtime are applied to subsequent requests in that conversation. Words such as “tonight”, “today”, or “right now” prevent writing a durable preference. “I generally dislike musicals” writes an explicit lasting preference. Your Taste displays evidence-derived insights and allows prefer/avoid/no-preference corrections without displaying numeric scores.

## Candidate generation

The generator requests bounded pools from TMDB discover, strongest known genres, recommendations for up to two daily-rotated liked/favorite titles, and up to six watchlisted titles. Relevant genre pools include popularity-ranked and rating-ranked second-page candidates; top explicit topics also use verified TMDB keyword IDs. All pools compete on the same score, with no famous-title ban or arbitrary obscure-title quota. It deduplicates by media type plus TMDB ID. Already-liked seeds are excluded from ordinary unwatched discovery, but remain accessible through exact lookup. Individual source or title hydration failure does not discard successful candidates. There is no catalog-wide LLM recall, vector database, collaborative filtering, or custom training.

Hard constraints precede ranking: requested type/genres/runtime, watched exclusion, rejected titles, and included owned-service availability. Unknown runtime cannot satisfy a strict runtime bound. Empty availability cannot satisfy an owned-service filter. Rent/buy access is not mistaken for included access. Exact title lookup bypasses these discovery exclusions and shows all reported country providers, including titles the user has watched.

## Ranking, availability and discovery

`rankingWeights` in `services/recommendation.ts` is the single readable weight configuration. Positive taste uses the three strongest matching dimensions with diminishing multipliers 1, .35 and .15. Unlike averaging, an additional valid match cannot lower the score. Negatives are stronger and require meaningful confidence. Current session mood outweighs ordinary background taste when matching metadata exists. Unsupported mood metadata contributes nothing rather than an invented tag. Included availability is a major practical signal; unavailable results are penalized in all-provider discovery and excluded in owned-service discovery.

Quality shrinks the catalog average toward 6/10 using 250 prior votes. Popularity contributes at most .15, far below taste/availability. Watchlist gives a small intent boost, not a claim of liking. All ranking components are retained with each delivered recommendation. Positive explanation sentences are assembled from those actual components. The UI no longer invents director affinity or “perfect match” percentages.

The final selection penalizes redundant genre/franchise combinations while staying inside the valid candidate set. General and favorite-neighbor pools provide plausible adjacent choices; there is no random exploration slot that can violate the request. Recently delivered recommendations get a declining fatigue penalty with a three-day half-life. Delivery is an approximation of exposure, not proof that a person viewed a card; it is never positive taste evidence. Recently rejected titles are excluded for seven days, explicit disliked titles remain excluded until the reaction changes, and Surprise Me also excludes IDs rejected in the current sheet. Ignoring a title once never permanently hides it.

## Feedback and privacy

Recommendation events store rank, score components and context; responses/actions are associated through title and conversation IDs. Event history is pruned after 90 days. Watchlist/history/reaction data remain user-owned. A watched mark is neither a Like nor a positive taste update. No sensitive psychological labels or vanity metrics are shown. Existing `viewerIds` boundaries allow later multi-viewer interfaces, but other viewer IDs are rejected in V1.

The current useful derived insights are preference strength/confidence/source sets and recent exposure/rejection state. Conversion-rate optimization and user-level experimentation are intentionally deferred until there is enough evidence to measure them honestly. The engine can add candidate sources and score components independently.

## Evaluation

### Extended concept-aware review

The later quality run adds independent topic candidate pools (up to four), a small inspectable concept/synonym bridge, and evidence from trusted overview text or keywords. Original-language constraints are hard filters. `genreMatch` and `keywordMatch` distinguish alternatives from required intersections. Broad Browse diversifies supported taste concepts as well as genre/franchise; it never requires all permanent interests in one film.

Nuanced intent uses `OPENAI_CHAT_MODEL`. Concept- or mood-led Chat additionally reviews up to 12 already filtered/ranked candidates in the existing composition call. The editor may narrow or abstain, not invent IDs, reorder or bypass constraints. Selected evidence must quote supplied metadata exactly. This validates provenance, not semantic perfection. Only delivered recommendations receive exposure records. A failed review uses an honest catalog-based fallback. No vector database, collaborative model, additional AI request or paid data source was introduced.

See DEEP_QUALITY_RESULTS.md for 26 varied live personas, mixed concepts/genres/constraints, actual findings and remaining limits. The older narrow evaluation observations below are historical, not the latest acceptance record.

The Phase 15 suite covers all twelve requested scenarios: explicit vs weak evidence, negative suppression, Watchlist strength, neutral watched state, temporary mood separation, availability, exact lookup, rejection, diversity, confidence, recency decay, and explicit corrections. Additional tests cover type-safe identifiers, fatigue, repeated-reaction deduplication, persistent/session ownership and expiry. Live verification proves that a real TMDB title reaction creates persisted taste dimensions through the HTTP API.

The September 26 user-journey run adds real synthetic personas, conversational constraint retention, corrections, dislike/history exclusion and repeat rejection. Simple extraction uses `OPENAI_MODEL`; rich preference descriptions, contextual/nuanced intent and grounded composition use `OPENAI_CHAT_MODEL`. Structured outputs are validated, and deterministic fallbacks preserve known follow-up constraints. These routing choices follow the OpenAI structured-output guidance; model output is still untrusted input, not availability evidence.

This is a practical content-based baseline, not a proven optimal recommender. A nature-documentary persona received strong nature matches but also general documentary candidates in later positions. Missing catalog tags limit topical precision and mood/safety judgments. Passing mechanical constraints does not establish human satisfaction; small-group feedback should guide further tuning before adding infrastructure.
