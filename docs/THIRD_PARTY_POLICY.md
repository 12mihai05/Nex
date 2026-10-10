# Third-party services: user decision

The owner explicitly requires asking for approval before introducing any new third-party service, even if it offers a free tier. Do not infer approval from general implementation autonomy, permission to research, or a free-first requirement.

Firebase/FCM is not approved and must not be used. Release alerts use the existing TMDB, Turso and GitHub Actions integrations plus the already-installed local notification package. No new vendor or account is required.

Local release popups appear when the app fetches newly discovered updates. They are not remote pushes and cannot promise delivery while the app remains closed. Existing scheduled TV reminders retain their normal behavior.
