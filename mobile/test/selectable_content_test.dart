import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/screens/chat_screen.dart';
import 'package:nex/src/screens/detail_screen.dart';
import 'package:nex/src/state/app_controller.dart';
import 'package:nex/src/models/content.dart';

void main() {
  testWidgets('both sides of a chat expose selectable text', (tester) async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final controller = container.read(appControllerProvider.notifier);
    controller.enterDemo();
    await controller.sendChat('Show me a movie');
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: ChatScreen()),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.byWidgetPredicate(
        (w) => w is SelectableText && w.data == 'Show me a movie',
      ),
      findsOneWidget,
    );
    expect(find.byType(SelectableText), findsAtLeastNWidgets(2));
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets('title synopsis exposes native selection and Copy', (
    tester,
  ) async {
    final item = ContentItem.fromJson({
      'id': 12,
      'mediaType': 'movie',
      'title': 'Test movie',
      'overview': 'A copyable synopsis.',
    });
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: ThemeData(platform: TargetPlatform.android),
          home: DetailScreen(item: item),
        ),
      ),
    );
    final synopsis = find.byWidgetPredicate(
      (w) => w is SelectableText && w.data == item.overview,
    );
    await tester.scrollUntilVisible(
      synopsis,
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    await tester.ensureVisible(synopsis);
    await tester.pumpAndSettle();
    await tester.longPress(synopsis);
    await tester.pumpAndSettle();
    expect(find.text('Copy'), findsOneWidget);
    await tester.tap(find.text('Copy'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
}
