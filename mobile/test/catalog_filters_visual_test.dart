import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/core/theme.dart';
import 'package:nex/src/widgets/catalog_filter_sheet.dart';

void main() {
  LiveTestWidgetsFlutterBinding();
  for (final dark in [true, false]) {
    testWidgets('catalog filters visual $dark', (tester) async {
      tester.view.physicalSize = const Size(430, 932);
      tester.view.devicePixelRatio = 1;
      await tester.binding.setSurfaceSize(const Size(430, 932));
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
      final key = GlobalKey();
      await tester.pumpWidget(
        RepaintBoundary(
          key: key,
          child: MaterialApp(
            theme: dark ? NexTheme.dark : NexTheme.light,
            home: const Scaffold(
              body: SafeArea(
                child: Padding(
                  padding: EdgeInsets.only(top: 24),
                  child: CatalogFilterSheet(
                    type: 'movie',
                    watchStatus: 'again',
                    services: {
                      8: 'Netflix',
                      1899: 'Max',
                      119: 'Prime Video',
                      337: 'Disney+',
                    },
                    providers: {8, 1899},
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final image =
          await (key.currentContext!.findRenderObject()
                  as RenderRepaintBoundary)
              .toImage();
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      await Directory('build/verification').create(recursive: true);
      await File(
        'build/verification/catalog-filters-${dark ? 'dark' : 'light'}.png',
      ).writeAsBytes(bytes!.buffer.asUint8List());
      image.dispose();
      expect(tester.takeException(), isNull);
    }, skip: Platform.environment['NEX_VISUAL_QA'] != '1');
  }
}
