# EPG and TV chat audit

Extend the existing XMLTV provider, EpgService and structured AI chat workflow; no new provider/service.

1. Compare raw source counts, normalized records, retained schedules and production country coverage. Inspect RO1/RO2 freshness and useful metadata; distinguish upstream gaps from import limits.
2. Correct XMLTV normalization and preserve useful programme metadata. Keep UTC, safe XML/download limits, retention, atomic replacement and stable channel identifiers.
3. Remove the arbitrary 120-channel truncation only after checking storage/snapshot costs. Keep explicit operational safety bounds visible rather than silently presenting partial imports as complete.
4. Separate AI-understood schedule, next-programme and recommendation requests. Resolve follow-ups from history/structured broadcasts, validate channel/programme IDs, ground all displayed facts in EPG. Filter off-air placeholders from recommendations, not factual channel schedules. Favourites are a soft preference; taste, useful metadata and diversity matter.
5. Regression tests, live source/database checks, representative live AI conversations, full backend checks and deployment verification. Document limitations honestly, particularly source gaps and uncertain programme metadata.

Initial evidence (2026-10-13): RO1 has 370 channels, 46,385 raw/46,383 parsed programmes, 356 channels with future schedules. Production RO has only 126 channels with future schedules (120 plus favourites). RO2 has 148 channel names but schedules for only three channels. Latest three GitHub EPG runs succeeded. Source is refreshed, but is not complete.
