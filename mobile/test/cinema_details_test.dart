import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/core/theme.dart';
import 'package:nex/src/models/content.dart';
import 'package:nex/src/screens/detail_screen.dart';
import 'package:nex/src/widgets/cinema_details.dart';
import 'package:nex/src/widgets/release_details.dart';

import 'release_features_test.dart' show ReleaseApi, viewer;

const cinema = {
  'dateConflict': true,
  'listings': [
    {
      'name': 'Cinema City',
      'date': '2026-11-27',
      'dateKind': 'reissue',
      'status': 'upcoming',
      'sourceUrl': 'https://www.cinemacity.ro/',
    },
    {
      'name': 'Cineplexx',
      'date': '2026-12-04',
      'dateKind': 'reissue',
      'status': 'upcoming',
      'sourceUrl': 'https://www.cineplexx.ro/',
    },
  ],
};

class CinemaApi extends ReleaseApi {
  @override
  Future<Map<String, dynamic>> object(String path) async =>
      path.endsWith('/releases')
      ? {
          'country': 'RO',
          'day': '2026-10-28',
          'releases': [],
          'subscriptions': [],
          'cinema': cinema,
        }
      : super.object(path);
}

void main() {
  final visual = Platform.environment['NEX_VISUAL_QA'] == '1';
  testWidgets(
    'current cinema copy is natural and a sole foreign dub is identified',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: CinemaDetails(
              data: {
                'listings': [
                  {
                    'name': 'Cinema City',
                    'status': 'listed',
                    'sourceUrl': 'https://www.cinemacity.ro/',
                  },
                  {
                    'name': 'Cineplexx',
                    'status': 'listed',
                    'variant': 'Hungarian dubbed',
                    'sourceUrl': 'https://www.cineplexx.ro/film/HO00007086',
                  },
                ],
              },
            ),
          ),
        ),
      );
      expect(find.text('In cinemas now'), findsOneWidget);
      expect(find.text('In cinemas now · Hungarian dubbed'), findsOneWidget);
      expect(find.text('Listed at this cinema chain'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
  if (visual) LiveTestWidgetsFlutterBinding();
  for (final dark in [false, true]) {
    for (final scale in [1.0, 1.6]) {
      testWidgets(
        'cinema sources fit and preserve old movie identity dark=$dark scale=$scale',
        (tester) async {
          tester.view.physicalSize = const Size(390, 800);
          tester.view.devicePixelRatio = 1;
          await tester.binding.setSurfaceSize(const Size(390, 800));
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
          final container = await viewer(CinemaApi());
          addTearDown(container.dispose);
          final item = ContentItem.fromJson({
            'id': 438631,
            'title': 'Dune',
            'releaseDate': '2021-09-15',
            'year': 2021,
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
                    appBar: AppBar(title: const Text('Dune · 2021')),
                    body: MediaQuery(
                      data: MediaQueryData(
                        textScaler: TextScaler.linear(scale),
                      ),
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.all(20),
                        child: ReleaseDetails(item: item),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          expect(find.text('Cinema City'), findsOneWidget);
          expect(find.text('Cineplexx'), findsOneWidget);
          expect(find.text('Cinema run Nov 27, 2026'), findsOneWidget);
          expect(find.text('Cinema run Dec 4, 2026'), findsOneWidget);
          expect(find.textContaining('no upcoming local date'), findsNothing);
          expect(
            find.text('Notify me'),
            findsNothing,
          ); // Reissue is not a first-premiere subscription.
          expect(tester.takeException(), isNull);
          if (visual && scale == 1) {
            final image =
                await (capture.currentContext!.findRenderObject()
                        as RenderRepaintBoundary)
                    .toImage();
            final bytes = await image.toByteData(
              format: ui.ImageByteFormat.png,
            );
            await Directory('build/verification').create(recursive: true);
            await File(
              'build/verification/cinema-${dark ? 'dark' : 'light'}.png',
            ).writeAsBytes(bytes!.buffer.asUint8List());
            image.dispose();
          }
        },
      );
    }
  }
  testWidgets(
    'no active chain means no cinema card, past listing does not claim current availability',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: CinemaDetails(
              data: {
                'listings': [
                  {'name': 'Old cinema', 'status': 'past'},
                ],
              },
            ),
          ),
        ),
      );
      expect(find.text('Old cinema'), findsNothing);
      expect(find.byType(Container), findsNothing);
    },
  );
  testWidgets(
    'empty and whitespace-only title information has readable placeholders',
    (tester) async {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      final item = ContentItem.fromJson({
        'id': 5,
        'title': 'A film',
        'overview': '  ',
        'director': ' ',
        'cast': ['  '],
      });
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp(home: DetailScreen(item: item)),
        ),
      );
      final premise = find.text('A synopsis is not available right now.');
      await tester.scrollUntilVisible(
        premise,
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      expect(premise, findsOneWidget);
      expect(
        find.text('Cast and crew information is not available right now.'),
        findsOneWidget,
      );
      expect(find.text('Directed by  '), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
}
