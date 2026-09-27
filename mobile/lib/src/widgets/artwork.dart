import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

class Artwork extends StatelessWidget {
  const Artwork({
    super.key,
    required this.url,
    this.fit = BoxFit.cover,
    this.borderRadius = 18,
  });
  final String? url;
  final BoxFit fit;
  final double borderRadius;

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(borderRadius),
    child: url == null
        ? _fallback(context)
        : CachedNetworkImage(
            imageUrl: url!,
            fit: fit,
            placeholder: (_, _) => Container(
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
            ),
            errorWidget: (_, _, _) => _fallback(context),
          ),
  );

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
