import 'package:flutter/material.dart';

/// One subtle sweep for a whole group, paused offscreen or for reduced motion.
class NexSkeleton extends StatefulWidget {
  const NexSkeleton({super.key, required this.child});
  final Widget child;
  @override
  State<NexSkeleton> createState() => _NexSkeletonState();
}

class _NexSkeletonState extends State<NexSkeleton>
    with SingleTickerProviderStateMixin {
  late final animation = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  );
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context) ||
        !TickerMode.valuesOf(context).enabled) {
      animation.stop();
    } else {
      animation.repeat();
    }
  }

  @override
  void dispose() {
    animation.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Loading',
    liveRegion: true,
    child: ExcludeSemantics(
      child: AnimatedBuilder(
        animation: animation,
        builder: (context, child) => ShaderMask(
          blendMode: BlendMode.srcATop,
          shaderCallback: (bounds) => LinearGradient(
            begin: Alignment(-3 + animation.value * 6, -1),
            end: Alignment(-1 + animation.value * 6, 1),
            colors: const [
              Colors.transparent,
              Color(0x18FFFFFF),
              Colors.transparent,
            ],
          ).createShader(bounds),
          child: child,
        ),
        child: widget.child,
      ),
    ),
  );
}

class SkeletonBlock extends StatelessWidget {
  const SkeletonBlock({super.key, this.height = 100, this.width});
  final double height;
  final double? width;
  @override
  Widget build(BuildContext context) => Container(
    height: height,
    width: width,
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      borderRadius: BorderRadius.circular(16),
    ),
  );
}

class PosterSkeletons extends StatelessWidget {
  const PosterSkeletons({super.key});
  @override
  Widget build(BuildContext context) => NexSkeleton(
    child: GridView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: 6,
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: 200,
        childAspectRatio: .65,
        crossAxisSpacing: 16,
        mainAxisSpacing: 16,
      ),
      itemBuilder: (_, _) => const SkeletonBlock(),
    ),
  );
}
