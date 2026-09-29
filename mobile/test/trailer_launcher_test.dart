import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:nex/src/services/trailer_launcher.dart';

void main() {
  const url = 'https://www.youtube.com/watch?v=abcdefghijk';
  test('external success needs only one call', () async {
    final modes = <LaunchMode>[];
    final result = await TrailerLauncher(
      opener: (uri, mode) async {
        modes.add(mode);
        return true;
      },
    ).open(url);
    expect(result, TrailerLaunchResult.opened);
    expect(modes, [LaunchMode.externalApplication]);
  });
  test('external errors and false results fall back to a browser', () async {
    for (final throws in [true, false]) {
      final modes = <LaunchMode>[];
      final result = await TrailerLauncher(
        opener: (uri, mode) async {
          modes.add(mode);
          if (mode == LaunchMode.externalApplication) {
            if (throws) throw PlatformException(code: 'ACTIVITY_NOT_FOUND');
            return false;
          }
          return true;
        },
      ).open(url);
      expect(result, TrailerLaunchResult.opened);
      expect(modes, [
        LaunchMode.externalApplication,
        LaunchMode.inAppBrowserView,
      ]);
    }
  });
  test('native bridge errors are distinct from unavailable handlers', () async {
    expect(
      await TrailerLauncher(
        opener: (_, _) async => throw MissingPluginException(),
      ).open(url),
      TrailerLaunchResult.bridgeUnavailable,
    );
    expect(
      await TrailerLauncher(
        opener: (_, _) async => throw PlatformException(code: 'channel-error'),
      ).open(url),
      TrailerLaunchResult.bridgeUnavailable,
    );
  });
  test(
    'all handlers failing is recoverable and unsafe links never launch',
    () async {
      var calls = 0;
      final launcher = TrailerLauncher(
        opener: (_, _) async {
          calls++;
          return false;
        },
      );
      expect(await launcher.open(url), TrailerLaunchResult.unavailable);
      expect(calls, 2);
      for (final bad in [
        'https://evil.example/watch?v=abcdefghijk',
        'javascript:alert(1)',
        'https://www.youtube.com/watch?v=bad',
      ]) {
        expect(await launcher.open(bad), TrailerLaunchResult.invalidLink);
      }
      expect(calls, 2);
    },
  );
}
