import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/core/theme.dart';
import 'package:nex/src/models/content.dart';
import 'package:nex/src/widgets/nex_search_field.dart';
import 'package:nex/src/widgets/release_details.dart';
import 'package:nex/src/widgets/title_feedback.dart';

import 'release_features_test.dart' show ReleaseApi, viewer;

class FutureReleaseApi extends ReleaseApi {
  @override
  Future<Map<String, dynamic>> object(String path) async =>
      path.endsWith('/releases')
      ? {
          'country': 'RO',
          'day': '2026-10-27',
          'releases': [],
          'subscriptions': [],
        }
      : super.object(path);
}

void main() {
  final visual = Platform.environment['NEX_VISUAL_QA'] == '1';
  if (visual) LiveTestWidgetsFlutterBinding();
  for (final dark in [false, true]) {
    for (final scale in [1.0, 1.6]) {
      testWidgets(
        'detail controls fit and separate alerts: dark=$dark scale=$scale',
        (tester) async {
          tester.view.physicalSize = const Size(390, 900);
          tester.view.devicePixelRatio = 1;
          await tester.binding.setSurfaceSize(const Size(390, 900));
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          addTearDown(() => tester.binding.setSurfaceSize(null));
          if (visual) {
            await (FontLoader('sans-serif')..addFont(
                  File('C:/Windows/Fonts/arial.ttf')
                      .readAsBytes()
                      .then(ByteData.sublistView),
                ))
                .load();
            await (FontLoader('MaterialIcons')
                  ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf')))
                .load();
          }
          final api = FutureReleaseApi();
          final container = await viewer(api);
          addTearDown(container.dispose);
          final input = TextEditingController(text: 'How to Rob a Bank');
          addTearDown(input.dispose);
          final item = ContentItem.fromJson({
            'id': 1437511,
            'title': 'How to Rob a Bank',
            'releaseDate': '2026-11-11',
          });
          final capture = GlobalKey();
          await tester.pumpWidget(
            UncontrolledProviderScope(
              container: container,
              child: MaterialApp(
                theme: dark ? NexTheme.dark : NexTheme.light,
                home: RepaintBoundary(
                  key: capture,
                  child: Scaffold(
                    appBar: AppBar(title: const Text('Title controls')),
                    body: MediaQuery(
                      data: MediaQueryData(
                        textScaler: TextScaler.linear(scale),
                      ),
                      child: SingleChildScrollView(
                        child: Padding(
                          padding: const EdgeInsets.all(20),
                          child: Column(
                            children: [
                              NexSearchField(
                                controller: input,
                                onChanged: (_) {},
                                hintText: 'Search movies and series',
                              ),
                              const SizedBox(height: 24),
                              FilledButton.icon(
                                onPressed: () {},
                                icon: const Icon(Icons.bookmark_outline),
                                label: const Text('Want to see'),
                              ),
                              const SizedBox(height: 14),
                              TitleFeedback(item: item),
                              ReleaseDetails(item: item),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          final cinema = find.widgetWithText(OutlinedButton, 'Cinema');
          final digital = find.widgetWithText(OutlinedButton, 'Digital');
          expect(cinema, findsOneWidget);
          expect(digital, findsOneWidget);
          expect(
            scale == 1
                ? tester.getTopLeft(digital).dx - tester.getTopRight(cinema).dx
                : tester.getTopLeft(digital).dy -
                      tester.getBottomLeft(cinema).dy,
            greaterThanOrEqualTo(12),
          );
          expect(
            find.textContaining('may already have announced'),
            findsOneWidget,
          );
          expect(find.text('Date not announced'), findsNothing);
          expect(
            tester
                .getCenter(find.widgetWithText(OutlinedButton, 'Mark as seen'))
                .dx,
            closeTo(195, 1),
          );
          expect(tester.takeException(), isNull);
          if (visual && scale == 1) {
            final boundary =
                capture.currentContext!.findRenderObject()
                    as RenderRepaintBoundary;
            final image = await boundary.toImage();
            final bytes = await image.toByteData(
              format: ui.ImageByteFormat.png,
            );
            await Directory('build/verification').create(recursive: true);
            await File(
              'build/verification/detail-controls-${dark ? 'dark' : 'light'}.png',
            ).writeAsBytes(bytes!.buffer.asUint8List());
            image.dispose();
          }
        },
      );
    }
  }
}
