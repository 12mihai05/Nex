import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/screens/home_shell.dart';
import 'package:nex/src/screens/browse_screen.dart';
import 'package:nex/src/state/app_controller.dart';

import 'library_restore_test.dart' show OfflineCatalogApi;

class FailedHomeApi extends OfflineCatalogApi {
  int fallbackCalls = 0;
  @override
  Future<List<Map<String, dynamic>>> list(String path) async {
    if (path.startsWith('/api/discovery')) throw StateError('Unavailable');
    return super.list(path);
  }

  @override
  Future<List<Map<String, dynamic>>> recommend() async {
    fallbackCalls++;
    return [];
  }
}

void main() {
  testWidgets(
    'system back returns TV and Chat to Streaming; overlays close first',
    (tester) async {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      container.read(appControllerProvider.notifier).enterDemo();
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(home: HomeShell()),
        ),
      );
      await tester.pumpAndSettle();
      for (final tab in ['TV', 'Chat']) {
        await tester.tap(find.text(tab).last);
        await tester.pumpAndSettle();
        expect(
          tester
              .widget<NavigationBar>(find.byType(NavigationBar))
              .selectedIndex,
          isNot(0),
        );
        final context = tester.element(find.byType(NavigationBar));
        showDialog<void>(
          context: context,
          builder: (_) => const AlertDialog(title: Text('Overlay')),
        );
        await tester.pumpAndSettle();
        await tester.binding.handlePopRoute();
        await tester.pumpAndSettle();
        expect(find.text('Overlay'), findsNothing);
        expect(
          tester
              .widget<NavigationBar>(find.byType(NavigationBar))
              .selectedIndex,
          isNot(0),
        );
        await tester.binding.handlePopRoute();
        await tester.pumpAndSettle();
        expect(
          tester
              .widget<NavigationBar>(find.byType(NavigationBar))
              .selectedIndex,
          0,
        );
        expect(
          tester
              .widget<PopScope<Object?>>(find.byType(PopScope<Object?>))
              .canPop,
          isTrue,
        );
      }
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'Home failure offers retry, not no-matches or another expensive request',
    (tester) async {
      final api = FailedHomeApi();
      final container = ProviderContainer(
        overrides: [nexApiClientProvider.overrideWithValue(api)],
      );
      addTearDown(container.dispose);
      await container.read(appControllerProvider.notifier).restoreSession();
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(home: BrowseScreen()),
        ),
      );
      await tester.pumpAndSettle();
      expect(api.fallbackCalls, 0);
      expect(
        find.text(
          'No matching picks. Try broader filters or more streaming services.',
        ),
        findsNothing,
      );
      expect(find.text('Retry'), findsWidgets);
      expect(container.read(appControllerProvider).error, isNotNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
