import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

// A device appearance preference, never part of the recommendation profile.
final lightPaletteProvider = NotifierProvider<LightPalette, bool>(
  LightPalette.new,
);

class LightPalette extends Notifier<bool> {
  final storage = const FlutterSecureStorage();
  int revision = 0;
  @override
  bool build() {
    final ticket = revision;
    Future<void>(() async {
      try {
        final saved = await storage.read(key: 'nex.light.paper');
        if (ref.mounted && ticket == revision) state = saved == 'true';
      } catch (_) {
        /* Default appearance remains available offline. */
      }
    });
    return false;
  }

  Future<void> setPaper(bool paper) async {
    revision++;
    state = paper;
    try {
      await storage.write(key: 'nex.light.paper', value: '$paper');
    } catch (_) {
      /* Keep this session's selection. */
    }
  }
}
