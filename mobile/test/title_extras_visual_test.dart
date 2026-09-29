import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/core/theme.dart';
import 'package:nex/src/data/demo_data.dart';
import 'package:nex/src/state/app_controller.dart';
import 'package:nex/src/widgets/title_extras.dart';

import 'title_extras_test.dart' show ExtrasApi;

void main() {
  LiveTestWidgetsFlutterBinding();
  for (final dark in [true, false]) {
    testWidgets('title extras visual ${dark ? 'dark' : 'light'}', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(430, 932);
      tester.view.devicePixelRatio = 1;
      await tester.binding.setSurfaceSize(const Size(430, 932));
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final font = File('C:/Windows/Fonts/arial.ttf');
      await (FontLoader(
        'sans-serif',
      )..addFont(font.readAsBytes().then(ByteData.sublistView))).load();
      await (FontLoader(
        'MaterialIcons',
      )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
      final api = ExtrasApi();
      final container = ProviderContainer(
        overrides: [nexApiClientProvider.overrideWithValue(api)],
      );
      addTearDown(container.dispose);
      await container.read(appControllerProvider.notifier).restoreSession();
      api.details.complete({
        'videos': [
          {
            'name': 'Official trailer',
            'type': 'Trailer',
            'official': true,
            'url': 'https://www.youtube.com/watch?v=abcdefghijk',
          },
          {
            'name': 'Teaser',
            'type': 'Teaser',
            'official': true,
            'url': 'https://www.youtube.com/watch?v=xyzabcdefgh',
          },
        ],
        'seasons': [
          {'number': 1, 'name': 'Season 1', 'episodeCount': 7},
          {'number': 2, 'name': 'Season 2', 'episodeCount': 13},
        ],
      });
      api.episodes.complete({
        'videos': [],
        'episodes': List.generate(
          7,
          (i) => {
            'number': i + 1,
            'name': [
              'Pilot',
              'The next chapter',
              'An unexpected turn',
              'Consequences',
              'Crossroads',
              'The decision',
              'A new beginning',
            ][i],
            'runtimeMinutes': 45,
            'rating': 8.2,
            'airDate': '2020-01-01',
          },
        ),
      });
      final key = GlobalKey();
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp(
            theme: dark ? NexTheme.dark : NexTheme.light,
            home: RepaintBoundary(
              key: key,
              child: Scaffold(
                appBar: AppBar(title: const Text('Series details')),
                body: SingleChildScrollView(
                  padding: const EdgeInsets.all(20),
                  child: TitleExtras(item: demoCatalog.first),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byType(DropdownButtonFormField<int>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Season 1 · 7 episodes').last);
      await tester.pumpAndSettle();
      final boundary =
          key.currentContext!.findRenderObject() as RenderRepaintBoundary;
      final image = await boundary.toImage();
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      await Directory('build/verification').create(recursive: true);
      await File(
        'build/verification/title-extras-${dark ? 'dark' : 'light'}.png',
      ).writeAsBytes(bytes!.buffer.asUint8List());
      image.dispose();
      expect(tester.takeException(), isNull);
    }, skip: Platform.environment['NEX_VISUAL_QA'] != '1');
  }
}
