# TV, Want to see and stable discovery — September 27, 2026

Follow-up investigation: [IDENTITY_FOLLOWUP_FIX.md](IDENTITY_FOLLOWUP_FIX.md) diagnoses the failing identity/memory case and records the scoped composition-context correction. It supersedes the provisional retrieval explanation below; the original run's failure counts remain historical evidence.

## Delivered behavior

- Three primary tabs: Streaming (TMDB), TV (EPG) and Chat. This intentionally supersedes the original two-tab specification at the user's request. Nex remains the product name.
- Separate Seen library and Want to see screens under Profile. Want to see reuses watchlist storage, has a visible bookmark badge on cards, and is independent of Seen and the four opinions. Seen never becomes an explicit Like.
- Unrated Want to see contributes at most 0.20 affinity; unrated Seen at most 0.12. They do not stack or accumulate indefinitely with library size. Same-title explicit ratings, including Meh, override these hints; removing flags reverses them. Behavioral-personalization opt-out disables both. Old watchlist-derived durable evidence is ignored. Legacy rows lacking trait snapshots are not assigned invented traits.
- Successful flag edits immediately update local counts/flags and refresh taste insights. Chat-created actions restore the library. New backend recommendation/Chat requests read current state. The current Streaming order remains stable for five minutes, with refresh on re-entry after expiry, changed country/services or manual refresh. Newly familiar/seen titles disappear immediately, without reshuffling remaining cards. A pending-taste message offers refresh.
- Country-scoped channel favorites, searchable/paginated full valid channel directory, optional favorites-only view and individual channel schedules. Live programmes put favorites first; upcoming programmes first use 0–30/30–60/later time buckets, then favorite, start time, channel name and programme ID. Compact previews reserve roughly one third of slots for available nonfavorites. Channel favorites never train movie taste.
- Lightweight channel metadata is kept even without an imported schedule. The default 60-channel schedule selection can be extended by favorites on the next sync, bounded to 20 favorites per user/country and 120 distinct requested channels per country. Withdrawn channels become inactive but remain removable from existing favorites. These are resource limits, not a claim of complete worldwide coverage.
- Burgundy accent, separate TV layout and restored reminder offset controls, verified in dark/light/narrow-large-text Flutter rendering. Real Romanian TV was also rendered over authenticated HTTP.

## Reliability and efficiency

No new infrastructure, vector database or background service was introduced. Backend remains Hono, Drizzle/Turso, Better Auth, TMDB, configured OpenAI models and free XMLTV schedules. Only the application's OpenAI usage is paid.

Public TMDB search/discover requests now have a five-minute cache; related titles one hour; genres/keyword lookup one day. Existing metadata/availability TTLs remain separate. Hash keys include request parameters/country, not credentials. Identical concurrent requests coalesce in a bounded map; failures are not cached; expired rows are pruned periodically. Private endpoints return `Cache-Control: private, no-store`.

Removed redundant profile writes. Flutter loads independent personal-state endpoints in parallel, does not rerank after every flag edit, and tolerates EPG failure without breaking Streaming. Duplicate same-title save taps are bounded, simultaneous saves of different titles do not overwrite each other, and failed saves retain prior state. A successful Chat action remains confirmed even if the subsequent library read fails.

Two additive migrations were applied to real Turso: watchlist trait snapshots/channel favorites, then channel lifecycle state. Existing data was preserved. Seven migrations now exist. Channel activation and schedule replacement share a transaction; retention remains seven past/fourteen future days, with failure preserving the last valid snapshot.

## Verified checks

- Backend: 116 tests in 13 suites; typecheck, lint and production TypeScript build passed. Migration consistency check passed.
- Flutter: analyzer clean; 18 ordinary tests passed. Five opt-in cases skip in the ordinary run; the two real HTTP tests and three visual variants were executed separately and passed.
- Real Flutter-to-local-backend HTTP: authentication, search, saved/seen/opinion independence, restoration, recommendations, Chat reference actions, TV directory/favorites/discovery, logout and rendered Streaming/TV passed. The final parallel-loading version passed both tests.
- All 15 real normal-user journey groups passed, including reminders, country changes, corrections, authorization, account deletion and token revocation. Both temporary accounts were removed.
- Dedicated live favorites verification passed anonymous rejection, cross-user and country isolation, fresh favorite visibility, nonfavorite availability, unchanged movie taste and unfavorite. A previously unimported HBO 2 HD schedule was imported on sync (31 programmes observed); the two synthetic accounts were removed.
- Final nine-country sync succeeded: RO 6,515; BG 5,571; GB 5,575; ES 6,154; FR 5,557; CH 7,006; IT 9,127; DE 6,284; MD 1,039 imported rows. Counts are snapshot observations. The temporary favorite was removed before this final bounded sync.
- All nine authenticated country checks passed, including explicit France Chat override without changing Romanian Settings and returning to Romania on an unnamed follow-up. Moldova remains limited to six live channels, not full national coverage.
- Full and production npm audits reported zero vulnerabilities. Source/generated-text secret scanning found zero configured-secret matches, without printing values. No deployment, commit or push occurred.

## Persona evaluation

The 26-persona live rerun uses the approved weak-Seen/Want policy and adds Want-to-see persistence, reversal, rating override and Chat reference actions to the prior mixed sequence. It covers underdogs across genres, non-sports underdogs, found family, identity/memory, competence/teamwork, class satire, nature, relationships, adult animation, languages, changing mood/genre, horror exclusions, impossible constraints, cold start and adversarial text. Synthetic opinions deliberately change each persona rather than preserving its initial preferences forever.

Final aggregate: 26 personas, 31 discovery conversation turns, 25/26 original scenario assertion passes. Three strict cases explicitly allowed and produced an honest abstention; the contradictory-runtime case correctly returned no result. All 26 backgrounds passed the expanded mixed-state sequence: 25 in the full run plus the identity/memory mixed-only rerun after its discovery failure. One concept-led reply used the explicitly labeled catalog fallback, so this is not described as successful live AI composition on every turn. Evidence is kept in ignored `.tooling/verification/personas-tv-want-final-{0,1,2}.json` and `personas-tv-want-identity-mixed.json`.

Observed quality limits are not hidden by pass counts. The identity/memory persona received a grounded first list, but its narrower “other options under 110 minutes” follow-up returned no confirmed matches and failed the nonempty-result assertion. Its separate complete mixed-behavior sequence passed. Do not interpret this as proof no suitable film exists globally; retrieval and editorial review operate on a bounded catalog shortlist.

The competence request returned group/problem-solving candidates in this run; the previous required-intersection run abstained. That does not establish a general fix for sparse conceptual metadata. Mood-led results are variable: the comfort-to-tense-mystery follow-up preserved its replacement constraints but selected Scoob! and Final Destination 2, which are mechanically eligible yet debatable mood fits. No-gore and adult-suitability requests still cannot be certified from incomplete TMDB metadata. The app warns about uncertainty; it does not have a licensed content-advisory database. No hand-picked title exceptions or weakened tests were added to manufacture green results.

The recommender is a practical, inspectable content-based baseline, not proven optimal human taste prediction. These tests establish state handling, constraints and observed behavior; they do not prove that every suggestion is enjoyable. A small friend-group pilot should guide subjective tuning before adding more machinery.

Final post-run Turso audit: seven applied migrations, zero foreign-key violations, zero programmes outside configured retention, zero remaining `nex-verify-*` accounts. Retained historical programme/channel totals can exceed a single current import, as designed. Final secret scanner checked 238 source/generated-text files and found zero configured-secret matches; this is scoped evidence, not a guarantee about arbitrary binary files or every possible leak mechanism.

## Still outside verified completion

- Deployment remains deferred. Backend-only Vercel deployment and Flutter-to-deployed-HTTPS verification have not occurred. Mobile distribution is separate.
- Android SDK/device and iOS/macOS are unavailable here. Web release builds and Flutter rendering passed; no native release/signing or actual OS notification delivery is claimed. Reminder lifecycle/plugin-boundary tests are not physical-device acceptance.
- Remote daily EPG workflow still needs repository secrets/variables and activation; manual real sync works. Free feeds have no uptime/completeness guarantee, and newly favored channels require a successful subsequent sync.
- Password-reset delivery and cross-device reminder reconciliation retain the previously documented limitations.
- The full original Definition of Done is not met until deployment/native acceptance steps are completed. Successful builds are not substituted for these checks.
