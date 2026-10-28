import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/widgets/artwork.dart';

void main() {
  for (final backdrop in <String?>[null, '']) {
    testWidgets('missing backdrop $backdrop uses the complete poster', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Artwork(
            url: backdrop,
            fallbackUrl: 'https://example.test/poster.jpg',
          ),
        ),
      );
      final image = tester.widget<CachedNetworkImage>(
        find.byType(CachedNetworkImage),
      );
      expect(image.imageUrl, 'https://example.test/poster.jpg');
      expect(image.fit, BoxFit.contain);
    });
  }
  testWidgets('failed backdrop uses poster, missing both uses placeholder', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Artwork(
          url: 'https://example.test/backdrop.jpg',
          fallbackUrl: 'https://example.test/poster.jpg',
        ),
      ),
    );
    final image = tester.widget<CachedNetworkImage>(
      find.byType(CachedNetworkImage),
    );
    final fallback = image.errorWidget!(
      tester.element(find.byType(CachedNetworkImage)),
      image.imageUrl,
      Exception('offline'),
    );
    await tester.pumpWidget(MaterialApp(home: fallback));
    expect(
      tester
          .widget<CachedNetworkImage>(find.byType(CachedNetworkImage))
          .imageUrl,
      'https://example.test/poster.jpg',
    );
    await tester.pumpWidget(const MaterialApp(home: Artwork(url: null)));
    expect(find.byIcon(Icons.movie_outlined), findsOneWidget);
  });
}
