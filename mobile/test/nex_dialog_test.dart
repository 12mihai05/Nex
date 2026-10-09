import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/core/theme.dart';
import 'package:nex/src/widgets/nex_dialog.dart';

void main() {
  for (final dark in [true, false]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('Nex dialog ${dark ? 'dark' : 'light'} at text scale $scale', (
        tester,
      ) async {
        tester.view.physicalSize = const Size(390, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        if (Platform.environment['NEX_CAPTURE_UI'] == '1') {
          await tester.runAsync(() async {
            final loader = FontLoader('sans-serif')
              ..addFont(
                File('C:/Windows/Fonts/arial.ttf')
                    .readAsBytes()
                    .then((b) => ByteData.sublistView(b)),
              );
            await loader.load();
            final icons = FontLoader('MaterialIcons')
              ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
            await icons.load();
          });
        }
        final boundary = GlobalKey();
        bool? result;
        await tester.pumpWidget(
          MaterialApp(
            theme: dark ? NexTheme.dark : NexTheme.light,
            builder: (context, child) => RepaintBoundary(
              key: boundary,
              child: MediaQuery(
                data: MediaQuery.of(context)
                    .copyWith(textScaler: TextScaler.linear(scale)),
                child: child!,
              ),
            ),
            home: Scaffold(
              body: Builder(
                builder: (context) => Center(
                  child: TextButton(
                    onPressed: () async {
                      result = await showDialog<bool>(
                        context: context,
                        builder: (modal) => NexDialog(
                          title: 'Clear chat?',
                          icon: Icons.chat_bubble_outline_rounded,
                          content: const Text(
                            'This deletes your chat history and resets the conversation. Your watchlist, Seen titles, ratings, saved taste and reminders stay as they are.',
                          ),
                          actions: [
                            TextButton(
                              onPressed: () => Navigator.pop(modal, false),
                              child: const Text('Keep chat'),
                            ),
                            FilledButton(
                              onPressed: () => Navigator.pop(modal, true),
                              child: const Text('Clear chat'),
                            ),
                          ],
                        ),
                      );
                    },
                    child: const Text('Open dialog'),
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.tap(find.text('Open dialog'));
        await tester.pumpAndSettle();
        expect(find.byType(NexDialog), findsOneWidget);
        expect(tester.takeException(), isNull);
        if (Platform.environment['NEX_CAPTURE_UI'] == '1') {
          await tester.runAsync(() async {
            final image =
                await (boundary.currentContext!.findRenderObject()!
                        as RenderRepaintBoundary)
                    .toImage();
            final bytes = await image.toByteData(
              format: ui.ImageByteFormat.png,
            );
            await Directory('build/verification').create(recursive: true);
            await File(
              'build/verification/dialog-${dark ? 'dark' : 'light'}-$scale.png',
            ).writeAsBytes(bytes!.buffer.asUint8List());
            image.dispose();
          });
        }
        await tester.ensureVisible(find.text('Keep chat'));
        await tester.tap(find.text('Keep chat'));
        await tester.pumpAndSettle();
        expect(result, isFalse);
        expect(find.byType(NexDialog), findsNothing);
        expect(tester.takeException(), isNull);
      });
    }
  }
}
