import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nex/src/core/theme.dart';
import 'package:nex/src/state/app_controller.dart';
import 'package:nex/src/screens/upcoming_movies.dart';
import 'package:nex/src/widgets/programme_sheet.dart';
import 'package:nex/src/screens/notifications_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'release_inbox_test.dart' show InboxApi;

import 'package:nex/src/models/tv_program.dart';

import 'release_features_test.dart' show ReleaseApi;

void main() {
  LiveTestWidgetsFlutterBinding();
  for (final dark in [true, false]) {
    testWidgets('release and programme visual ${dark ? 'dark' : 'light'}', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await (FontLoader('sans-serif')..addFont(
            File('C:/Windows/Fonts/arial.ttf')
                .readAsBytes()
                .then(ByteData.sublistView),
          ))
          .load();
      await (FontLoader(
        'MaterialIcons',
      )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
      final api = ReleaseApi();
      final container = ProviderContainer(
        overrides: [nexApiClientProvider.overrideWithValue(api)],
      );
      addTearDown(container.dispose);
      await container.read(appControllerProvider.notifier).restoreSession();
      api.pending.complete({
        'data': List.generate(
          6,
          (i) => {
            'id': i + 1,
            'title': [
              'The next chapter',
              'A distant shore',
              'Second chances',
              'The last train',
              'A quiet summer',
              'The arrival',
            ][i],
            'releaseDate': '2026-11-${10 + i}',
            'releaseCountry': 'RO',
            'metadataOnly': true,
          },
        ),
        'meta': {'hasMore': false, 'day': '2026-10-10'},
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
                appBar: AppBar(title: const Text('Nex · Upcoming')),
                body: const UpcomingMovies(),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      Future<void> capture(String name) async {
        final boundary =
            key.currentContext!.findRenderObject() as RenderRepaintBoundary;
        final image = await boundary.toImage();
        final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
        await Directory('build/verification').create(recursive: true);
        await File('build/verification/$name-${dark ? 'dark' : 'light'}.png')
            .writeAsBytes(bytes!.buffer.asUint8List());
        image.dispose();
      }

      await capture('upcoming');
      final p = TvProgram(
        id: 'p',
        title: 'An evening at the cinema',
        description: 'Two old friends reunite after years apart. A journey across the country gives them the chance to put things right.',
        channel: 'Antena 1',
        startsAt: DateTime.now().add(const Duration(hours: 3)),
        endsAt: DateTime.now().add(const Duration(hours: 5)),
      );
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp(
            theme: dark ? NexTheme.dark : NexTheme.light,
            home: RepaintBoundary(
              key: key,
              child: Scaffold(
                appBar: AppBar(title: const Text('TV programme')),
                body: Align(
                  alignment: Alignment.bottomCenter,
                  child: ProgrammeSheet(program: p),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await capture('programme');
      SharedPreferences.setMockInitialValues({});
      final inboxContainer = ProviderContainer(
        overrides: [nexApiClientProvider.overrideWithValue(InboxApi())],
      );
      addTearDown(inboxContainer.dispose);
      await inboxContainer
          .read(appControllerProvider.notifier)
          .restoreSession();
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: inboxContainer,
          child: MaterialApp(
            theme: dark ? NexTheme.dark : NexTheme.light,
            home: RepaintBoundary(key: key, child: const NotificationsScreen()),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await capture('notifications');
      expect(tester.takeException(), isNull);
    }, skip: Platform.environment['NEX_VISUAL_QA'] != '1');
  }
}
