# Nex — Samsung acceptance check

Use your existing account: do not delete it or repeat your ratings. From `mobile`, fully stop the old Flutter session and run:

```powershell
flutter pub get
flutter run --dart-define=API_BASE_URL=https://nex-three-omega.vercel.app
```

No separate manual APK reinstall is needed. Refresh Home once and confirm the refresh dialog so its old cached snapshot is replaced.

## Priority checks

1. **Home speed and rows:** open Home, scroll through several batches, then return to it. Existing rows should stay stable; new rows should have correctly sized skeletons and begin at the first card. There should be no duplicate titles across batches or “no matching picks” error with ordinary settings. Most broad rows should have 20 cards; narrow themes can be shorter rather than padded with unrelated titles.
2. **Taste across later batches:** review a few early and late rows. Explicitly excluded anime should stay excluded; animation/cartoon films should not disappear just because anime is excluded. An ordinary dislike is a ranking penalty, not an absolute ban. Note any wrong title, its row and why it seems wrong.
3. **Movie examples in Chat:** try “I like Arrival (2016) directed by Denis Villeneuve and Contact (1997), but disliked Prometheus (2012) directed by Ridley Scott.” Check Your Taste shows the intended examples and sentiment. This should not mark the titles Seen or change library ratings. Remove these test preferences afterward if they are not yours. Ambiguous titles should prompt clarification, not guess.
4. **TV favorites while scrolling:** scroll far down the guide, favorite and unfavorite channels. Your current vertical/time position should remain stable. Favorites may move to the front after explicitly refreshing or leaving and returning. Searching should retain what you type.
5. **Android Back:** from TV or Chat, use both the system Back button and swipe gesture. They should return to Streaming. Back from Streaming may leave the app. Back from an opened detail/dialog should close that first.
6. **Home/Pick filters:** try Movies, Series, a genre, exact minimum/maximum movie duration, and deselect a streaming service. Test New to me / Watch again / Either in Home and Pick. Results must respect the selected services and duration; no “request invalid” error. Either permits seen titles but does not guarantee one appears in every batch.
7. **Library actions:** set Seen without a rating; add/remove Want to see; switch Like → Dislike → Meh → Super Like. Controls should respond promptly and stay correct after reopening. Seen and ratings remain independent. Chat/Taste should see changes promptly; Home should keep its current snapshot until you refresh.
8. **Reminder on the phone:** choose a future programme, enter a custom advance time that is still in the future, grant notifications, then lock the phone. Check the notification arrives and includes programme and channel. Test cancellation too. This is a notification, not a continuously ringing alarm; Android permission/battery behavior needs the real device.

## Quick visual/function checks

- Light and dark mode: readable phone clock/battery, clear cards and filters, styled confirmation dialogs; no dark-theme regression.
- Long-press Chat text and a movie description: copy should work.
- Open a trailer from movie details and Pick. It should open a suitable app/browser; temporary toast messages should disappear.
- Close/reopen Nex: account should remain signed in. The app should stay in portrait orientation.
- Change country in Settings: the TV guide must show that country only. Change back afterward. A Chat question explicitly naming another country may use that country's guide.

If anything fails, send the screen/action, approximate time, title/channel if relevant, active filters and a screenshot or short recording. Never send passwords, invite codes, tokens or `.env` contents.
