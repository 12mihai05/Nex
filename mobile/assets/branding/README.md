# Nex identity

`nex-icon.png` is the approved launcher artwork, generated with the built-in image tool (not the application's API key). Launcher sizes are generated with `dart run flutter_launcher_icons`; see `../../flutter_launcher_icons.yaml` and the [generator documentation](https://pub.dev/packages/flutter_launcher_icons).

In-app branding is a clean background-free vector interpretation in `lib/src/widgets/nex_mark.dart`. Ivory faces are used in dark mode; burgundy faces preserve contrast in light mode. Generated transparent cutouts were rejected because their edges contained artifacts. Do not replace the vector with those cutouts.

Launcher generation prompt:

> Use case: logo-brand. Asset type: production Android/iOS launcher icon for Nex, a personal cinema discovery app. Design a striking original monogram combining an abstract uppercase N with a single diagonal cinematic light cut / film splice. Premium geometric design, confident broad silhouette, carefully balanced negative space, crisp vector-like flat shapes, not a typeface glyph pasted on a square. Warm ivory mark with a subtle muted crimson edge on a solid deep burgundy #681C32 full-bleed square background. Center the mark inside the middle 60 percent of the canvas so circular launcher masks do not clip it. Restrained cinema/theater feeling, modern and memorable at 48px. One icon only. No emoji, no Flutter mark, no Netflix ribbon N imitation, no film-reel clipart, no generic play button, no mockup phone, no words, no frame, no rounded outer corners, no shadows, no texture, no watermark. Square asset, opaque background.

The app display name is Nex on Android, iOS and web. iOS icon assets are generated but iOS compilation requires macOS and was not performed on this Windows machine.

After regenerating with flutter_launcher_icons 0.14.4, inspect the Xcode diff: the generator may incorrectly replace `ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS = YES` with `AppIcon`. Keep that boolean setting as `YES`.
