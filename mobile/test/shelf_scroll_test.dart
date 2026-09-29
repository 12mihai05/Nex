import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/models/content.dart';
import 'package:nex/src/widgets/content_row.dart';
import 'package:nex/src/widgets/skeleton.dart';

ContentRow shelf(String name, {int start = 0}) => ContentRow(name, null, [
  for (var i = 0; i < 20; i++)
    ContentItem.fromJson({
      'id': start + i,
      'mediaType': 'movie',
      'title': '$name $i',
    }),
]);

void main() {
  testWidgets(
    'new loaded rows start at the first card and returning rows retain only their own offset',
    (tester) async {
      final bucket = PageStorageBucket();
      Future<void> show(Widget child) async {
        await tester.pumpWidget(
          ProviderScope(
            child: MaterialApp(
              home: Scaffold(
                body: PageStorage(
                  bucket: bucket,
                  child: KeyedSubtree(
                    key: const PageStorageKey('streaming-feed'),
                    child: SingleChildScrollView(child: child),
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pump();
      }

      ScrollPosition position() => tester
          .state<ScrollableState>(
            find
                .descendant(
                  of: find.byType(ContentShelf),
                  matching: find.byType(Scrollable),
                )
                .first,
          )
          .position;

      await show(ContentShelf(row: shelf('First')));
      await tester.drag(find.byType(ListView), const Offset(-1700, 0));
      await tester.pumpAndSettle();
      final firstOffset = position().pixels;
      expect(firstOffset, greaterThan(500));

      await show(const HomeSkeleton(showHero: false));
      await show(ContentShelf(row: shelf('New batch', start: 100)));
      expect(position().pixels, 0);

      await show(ContentShelf(row: shelf('First')));
      expect(position().pixels, closeTo(firstOffset, .1));

      await show(ContentShelf(row: shelf('First', start: 200)));
      expect(
        position().pixels,
        0,
        reason: 'Refreshed contents must not inherit the old set’s position',
      );
    },
  );
}
