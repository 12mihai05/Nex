# Release discovery and alerts

Current user-approved design: existing TMDB + Turso + GitHub Actions, with a private in-app inbox and the existing local notification package. No Firebase/FCM or new third-party service. See THIRD_PARTY_POLICY.md: obtain explicit approval before adding any new service.

The daily worker baselines existing seasons/releases, checks subsequent dated events, inserts an idempotent subscription/event inbox record, and never sends remote pushes. Country, opt-outs and Seen-series settings are checked again atomically before insertion. Account deletion cascades to inbox data. The app retrieves its own selected-country inbox in batches; read and popup acknowledgement are separate.

Local popups are optional and grouped, only after a foreground/open/resume sync. Failure to show or acknowledge leaves the update in the inbox. Logout invalidates pending fetches and cancels the release popup. Existing exact-time TV reminders are unchanged. Never promise discovery of new releases while Nex remains closed.

Upcoming cinema/search/date features and the details-first TV programme sheet remain in scope. Known Germany empty-page discovery defect is separate and remains documented, not fixed by this notification change.

Test backend ownership, countries, idempotency, retries, cancellation and pagination; Flutter inbox, popup denial/retry, logout races, all regressions and Android build. Test the real GitHub workflow after migration/deployment. Phone OS popup display still requires a physical-device check.
