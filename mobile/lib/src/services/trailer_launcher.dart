import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

enum TrailerLaunchResult { opened, invalidLink, unavailable, bridgeUnavailable }

typedef TrailerOpener = Future<bool> Function(Uri uri, LaunchMode mode);

class TrailerLauncher {
  TrailerLauncher({TrailerOpener? opener})
    : _open = opener ?? ((uri, mode) => launchUrl(uri, mode: mode));
  final TrailerOpener _open;

  static Uri? validatedUrl(String value) {
    final uri = Uri.tryParse(value);
    if (uri == null ||
        uri.scheme != 'https' ||
        uri.host != 'www.youtube.com' ||
        uri.path != '/watch' ||
        uri.userInfo.isNotEmpty ||
        (uri.hasPort && uri.port != 443) ||
        !RegExp(r'^[\w-]{11}$').hasMatch(uri.queryParameters['v'] ?? '')) {
      return null;
    }
    return Uri.https('www.youtube.com', '/watch', {
      'v': uri.queryParameters['v']!,
    });
  }

  Future<TrailerLaunchResult> open(String value) async {
    final uri = validatedUrl(value);
    if (uri == null) return TrailerLaunchResult.invalidLink;
    // Direct launching avoids Android package-visibility false negatives.
    // If the external handler fails, try a browser surface inside the app.
    for (final mode in [
      LaunchMode.externalApplication,
      LaunchMode.inAppBrowserView,
    ]) {
      try {
        if (await _open(uri, mode)) return TrailerLaunchResult.opened;
      } on MissingPluginException {
        if (kDebugMode) {
          debugPrint('Nex trailer launcher: native plugin missing');
        }
        return TrailerLaunchResult.bridgeUnavailable;
      } on PlatformException catch (error) {
        if (kDebugMode) debugPrint('Nex trailer launcher: ${error.code}');
        if (error.code == 'channel-error') {
          return TrailerLaunchResult.bridgeUnavailable;
        }
      } catch (error) {
        if (kDebugMode) {
          debugPrint('Nex trailer launcher: ${error.runtimeType}');
        }
        // A failed platform handler must not prevent the browser fallback.
      }
    }
    return TrailerLaunchResult.unavailable;
  }
}
