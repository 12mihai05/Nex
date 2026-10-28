import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

class Artwork extends StatelessWidget {
  const Artwork({
    super.key,
    required this.url,
    this.fit = BoxFit.cover,
    this.borderRadius = 18,
    this.fallbackUrl,
  });
  final String? url;
  final BoxFit fit;
  final double borderRadius;
  final String? fallbackUrl;

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(borderRadius),
    child: url == null || url!.trim().isEmpty
        ? _secondary(context)
        : CachedNetworkImage(
            imageUrl: url!,
            fit: fit,
            placeholder: (_, _) => Container(
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
            ),
            errorWidget: (_, _, _) => _secondary(context),
          ),
  );

  Widget _secondary(BuildContext context) {
    if (fallbackUrl == null ||
        fallbackUrl!.trim().isEmpty ||
        fallbackUrl == url) {
      return _fallback(context);
    }
    return ColoredBox(
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      child: Artwork(url: fallbackUrl, fit: BoxFit.contain, borderRadius: 0),
    );
  }

  Widget _fallback(BuildContext context) => Container(
    color: Theme.of(context).colorScheme.surfaceContainerHighest,
    alignment: Alignment.center,
    child: Icon(
      Icons.movie_outlined,
      size: 40,
      color: Theme.of(context).colorScheme.onSurfaceVariant,
    ),
  );
}
