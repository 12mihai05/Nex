import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:nex/src/core/theme.dart';
import 'package:nex/src/widgets/skeleton.dart';

double contrast(Color a, Color b) {
  final x = a.computeLuminance(), y = b.computeLuminance();
  return x > y ? (x + .05) / (y + .05) : (y + .05) / (x + .05);
}

void main() {
  testWidgets('light skeleton blocks are distinct from the page', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: NexTheme.light,
        home: const Scaffold(body: SkeletonBlock()),
      ),
    );
    final box = tester.widget<Container>(
      find.descendant(
        of: find.byType(SkeletonBlock),
        matching: find.byType(Container),
      ),
    );
    final color = (box.decoration! as BoxDecoration).color!;
    expect(
      contrast(color, NexTheme.light.scaffoldBackgroundColor),
      greaterThan(1.5),
    );
  });
  test(
    'selected icon buttons have readable themed foreground and background',
    () {
      final theme = NexTheme.light;
      final style = theme.iconButtonTheme.style!;
      final states = <WidgetState>{WidgetState.selected};
      expect(
        contrast(
          style.foregroundColor!.resolve(states)!,
          style.backgroundColor!.resolve(states)!,
        ),
        greaterThan(4.5),
      );
    },
  );
  test('cool light surfaces separate cards and retain readable text', () {
    for (final theme in [NexTheme.light]) {
      final scheme = theme.colorScheme;
      expect(theme.scaffoldBackgroundColor.computeLuminance(), lessThan(.65));
      expect(
        contrast(theme.cardTheme.color!, theme.scaffoldBackgroundColor),
        greaterThan(1.2),
      );
      for (final surface in [
        scheme.surface,
        theme.cardTheme.color!,
        scheme.surfaceContainerHighest,
      ]) {
        expect(contrast(scheme.onSurface, surface), greaterThan(7));
        expect(contrast(scheme.onSurfaceVariant, surface), greaterThan(4.5));
      }
      expect(contrast(scheme.primary, scheme.onPrimary), greaterThan(4.5));
      expect(
        contrast(scheme.primaryContainer, scheme.onPrimaryContainer),
        greaterThan(4.5),
      );
    }
  });
  test('dark palette remains unchanged', () {
    final theme = NexTheme.dark;
    expect(theme.scaffoldBackgroundColor, const Color(0xFF090A0C));
    expect(theme.cardTheme.color, const Color(0xFF14161A));
    expect(theme.colorScheme.primary, const Color(0xFFF0788F));
    expect(theme.colorScheme.onSurface, const Color(0xFFF5F1F2));
    expect(theme.colorScheme.surfaceContainerHighest, const Color(0xFF292329));
  });
}
