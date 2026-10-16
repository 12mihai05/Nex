import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/core/theme.dart';
import 'package:nex/src/screens/taste_screen.dart';
import 'package:nex/src/state/app_controller.dart';

import 'recommendation_engine_test.dart' show EngineApi;
import 'visual_review_test.dart' show VisualBinding;

void main() {
  VisualBinding();
  for (final variant in ['dark', 'light', 'large']) {
    testWidgets('recommendation settings render $variant', (tester) async {
      final size = Size(variant == 'large' ? 360 : 430, 932);
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      await tester.binding.setSurfaceSize(size);
      addTearDown(() => tester.binding.setSurfaceSize(null));
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final font = File('C:/Windows/Fonts/arial.ttf');
      if (await font.exists()) {
        await (FontLoader(
          'sans-serif',
        )..addFont(font.readAsBytes().then(ByteData.sublistView))).load();
      }
      await (FontLoader(
        'MaterialIcons',
      )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
      final c = ProviderContainer(
        overrides: [
          nexApiClientProvider.overrideWithValue(
            EngineApi()..engine = 'semantic',
          ),
        ],
      );
      addTearDown(c.dispose);
      await c.read(appControllerProvider.notifier).restoreSession();
      final boundary = GlobalKey();
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: c,
          child: RepaintBoundary(
            key: boundary,
            child: MaterialApp(
              debugShowCheckedModeBanner: false,
              theme: variant == 'light' ? NexTheme.light : NexTheme.dark,
              home: const TasteScreen(),
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context).copyWith(
                  textScaler: TextScaler.linear(variant == 'large' ? 1.4 : 1),
                ),
                child: child!,
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Recommendation settings'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      final image =
          await (boundary.currentContext!.findRenderObject()!
                  as RenderRepaintBoundary)
              .toImage();
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      await Directory('build/verification').create(recursive: true);
      await File('build/verification/recommendation-$variant.png')
          .writeAsBytes(bytes!.buffer.asUint8List());
      image.dispose();
    }, skip: Platform.environment['NEX_VISUAL_QA'] != '1');
  }
}
