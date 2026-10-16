import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/state/light_palette.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'warm paper is a persisted device preference, independent of account Taste',
    () async {
      FlutterSecureStorage.setMockInitialValues({});
      final first = ProviderContainer();
      expect(first.read(lightPaletteProvider), isFalse);
      await first.read(lightPaletteProvider.notifier).setPaper(true);
      expect(first.read(lightPaletteProvider), isTrue);
      first.dispose();
      final second = ProviderContainer();
      addTearDown(second.dispose);
      second.read(lightPaletteProvider);
      await Future<void>.delayed(const Duration(milliseconds: 10));
      expect(second.read(lightPaletteProvider), isTrue);
    },
  );
}
