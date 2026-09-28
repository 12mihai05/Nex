import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/core/theme.dart';
import 'package:nex/src/widgets/skeleton.dart';

import 'visual_review_test.dart' show VisualBinding;

void main() {
  VisualBinding();
  for (final variant in ['dark', 'light', 'narrow-large']) {
    testWidgets('loading geometry: $variant', (tester) async {
      final size = variant == 'narrow-large'
          ? const Size(360, 800)
          : const Size(430, 1100);
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      await tester.binding.setSurfaceSize(size);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await Directory('build/verification').create(recursive: true);
      final font = File('C:/Windows/Fonts/arial.ttf');
      if (await font.exists()) {
        await (FontLoader(
          'sans-serif',
        )..addFont(font.readAsBytes().then(ByteData.sublistView))).load();
      }
      for (final entry in <String, Widget>{
        'posters': const PosterSkeletons(),
        'home': const SingleChildScrollView(child: HomeSkeleton()),
        'tv': const SingleChildScrollView(
          padding: EdgeInsets.symmetric(horizontal: 16),
          child: TvShelvesSkeleton(),
        ),
        'guide': const SingleChildScrollView(
          padding: EdgeInsets.symmetric(horizontal: 16),
          child: ChannelListSkeleton(),
        ),
        'schedule': const SingleChildScrollView(
          padding: EdgeInsets.all(12),
          child: ChannelListSkeleton(schedule: true),
        ),
      }.entries) {
        final boundary = GlobalKey();
        await tester.pumpWidget(
          RepaintBoundary(
            key: boundary,
            child: MaterialApp(
              debugShowCheckedModeBanner: false,
              theme: variant == 'light' ? NexTheme.light : NexTheme.dark,
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context).copyWith(
                  textScaler: TextScaler.linear(
                    variant == 'narrow-large' ? 1.4 : 1,
                  ),
                ),
                child: child!,
              ),
              home: Scaffold(
                appBar: AppBar(title: Text(entry.key)),
                body: entry.value,
              ),
            ),
          ),
        );
        await tester.pump(const Duration(milliseconds: 400));
        expect(tester.takeException(), isNull, reason: '$variant/${entry.key}');
        final image =
            await (boundary.currentContext!.findRenderObject()
                    as RenderRepaintBoundary)
                .toImage();
        final data = await image.toByteData(format: ui.ImageByteFormat.png);
        await File('build/verification/$variant-loading-${entry.key}.png')
            .writeAsBytes(data!.buffer.asUint8List());
        image.dispose();
      }
      await tester.pumpWidget(const SizedBox());
    }, skip: Platform.environment['NEX_VISUAL_QA'] != '1');
  }
}
