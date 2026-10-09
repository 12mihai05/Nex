# TV, Home reliability and Android navigation follow-up

## Changes

- Favorite saves update the star without reloading the TV guide or moving the
  scroll position. Subsequent pages carry original favorite ordering for changed
  channels, avoiding skipped/duplicated channels after a mutation. Refresh or
  returning to TV clears that ordering. Country and user isolation remain intact.
- System Back from TV/Chat returns to Streaming. Streaming permits the normal OS
  exit behavior. Detail routes and dialogs retain their own back behavior.
- Home failures now show an error and retry, not an incorrect no-matches message.
  Removed the catch-all fallback that issued a second expensive recommendation
  request after discovery failed. An empty successful result also stays empty.
- Optional refill scheduling uses a 12-second budget measured from the beginning
  of retrieval, rather than an additional 25 seconds after initial retrieval.
  This is a scheduling budget, not an absolute response deadline: in-flight
  requests and final personalization still finish. The target stays 20, with
  no hard-filter relaxation or invented filler.
- Concept synonym lookup uses a precomputed index instead of scanning the entire
  dictionary for every candidate/preference comparison. Ranking weights unchanged.
- A public metadata cache persistence outage cannot discard successful TMDB
  responses. A failed Home impression write cannot discard already-generated rows.

## Verification (2026-10-10)

- Backend: 206 tests, typecheck, lint and build passed.
- Flutter: 77 tests passed; 17 opt-in tests skipped. Analyzer clean.
- Android debug APK built successfully against the production API address.
- Regression tests cover keeping TV scroll position after a save, frozen paged
  ordering after unfavoriting, country isolation, normal reordering on refresh,
  system Back through tabs and dialogs, Home failure without duplicate requests,
  cache failures and the refill scheduling budget.
- Existing-account generation: previous implementation took 42,164 ms. Updated
  runs took 20,228 and 20,252 ms, delivering row counts 20/17/20/9/20/16.
  These are live end-to-end generation measurements, not a controlled benchmark:
  provider/cache conditions vary. The updated runs reported the application's
  daily recommendation budget reached and used baseline fallback; they do not
  establish live semantic ranking performance. Ratings/history/settings unchanged.
- The originally reported generic production 500 was not reproduced by those
  generation checks. Do not describe its precise underlying cause as proven.
  Error presentation and avoidable failure propagation have been corrected.

## Remaining limitations

First-load generation can still take seconds, especially with sparse themes and
cold provider metadata. This patch does not claim every row reaches 20 or that
latency is solved completely. Native gesture behavior has widget-test coverage;
the Android build alone does not establish real-device gesture verification.
