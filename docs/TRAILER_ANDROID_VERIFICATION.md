# Android trailer regression — 29 September 2026

The phone reported `Nex trailer launcher: channel-error` repeatedly. Its installed
APK (last update 13:44:24 local time) was inspected read-only: none of its DEX files
contained `UrlLauncherPlugin` or the URL launch Pigeon channel. The locally built
APK contained both. This establishes a missing native plugin in the installed build,
not a failed TMDB trailer lookup or Vercel deployment. Which earlier build step
omitted it has not been established.

MainActivity now explicitly references the launcher plugin and registers it only
if the Flutter engine registry does not already contain it. Normal generated
registration still runs first. This prevents a missing generated registration entry
from silently disabling links; the native reference also fails compilation if the
launcher dependency is absent instead of producing an apparently valid broken APK.

Verification:

- Flutter analysis passed; eight targeted trailer/detail/Pick tests passed.
- Opt-in native integration test ran on the connected Samsung SM S918B and returned
  `TrailerLaunchResult.opened` for a known public trailer. One native test passed.
- This verifies Android accepted the actual link launch, not YouTube playback quality
  or availability of every TMDB video.
- The normal application is restored using `flutter run` after the integration test.
  No uninstall, data-clear, backend change, or credential logging is required.

The diagnostic APK copy is in ignored `.tooling/verification/phone-nex.apk` and is
not intended for redistribution or committing. It contains installed app code, not
the application's private data directory.

## Follow-up: unresolved native import

The later `Unresolved reference 'urllauncher'` build failure had an observable
configuration mismatch: pubspec and package configuration included url_launcher,
but `.flutter-plugins-dependencies` and the Dart plugin registrant omitted it.
Running `flutter pub get` in `mobile` regenerated both registrations, restored the
Android dependency, and the debug build passed without changing or removing the
native guard. The Windows user PATH and local.properties pointed to the same SDK.
The exact process that originally left the generated metadata stale remains unknown.
The native trailer integration test passed again on SM S918B after regeneration.
If this error recurs, run `flutter pub get` before `flutter run`; do not hand-edit
generated plugin files or remove trailer support to hide the failure.
