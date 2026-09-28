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
  const SkeletonBlock({
    super.key,
    this.height = 100,
    this.width,
    this.radius = 16,
  });
  final double height;
  final double? width;
  final double radius;
  @override
  Widget build(BuildContext context) => Container(
    height: height,
    width: width,
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      borderRadius: BorderRadius.circular(radius),
    ),
  );
}

class PosterSkeletons extends StatelessWidget {
  const PosterSkeletons({super.key, this.onboarding = false});
  final bool onboarding;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final padding = onboarding ? 0.0 : 16.0;
      final gap = onboarding ? 10.0 : 14.0;
      final maxWidth = onboarding ? 145.0 : 180.0;
      final ratio = onboarding ? .53 : .49;
      final columns = ((constraints.maxWidth - 2 * padding) / (maxWidth + gap))
          .ceil()
          .clamp(1, 12);
      final width =
          (constraints.maxWidth - 2 * padding - gap * (columns - 1)) / columns;
      final height = constraints.hasBoundedHeight
          ? constraints.maxHeight
          : MediaQuery.sizeOf(context).height;
      final count = ((height / (width / ratio + 18)).ceil() + 1) * columns;
      return NexSkeleton(
        child: GridView.builder(
          padding: EdgeInsets.all(padding),
          itemCount: count,
          gridDelegate: SliverGridDelegateWithMaxCrossAxisExtent(
            maxCrossAxisExtent: maxWidth,
            childAspectRatio: ratio,
            crossAxisSpacing: gap,
            mainAxisSpacing: onboarding ? 10 : 18,
          ),
          itemBuilder: (_, _) => PosterCardSkeleton(onboarding: onboarding),
        ),
      );
    },
  );
}

class PosterCardSkeleton extends StatelessWidget {
  const PosterCardSkeleton({super.key, this.onboarding = false});
  final bool onboarding;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      if (onboarding)
        const Expanded(child: SkeletonBlock(radius: 14))
      else
        const Flexible(
          child: AspectRatio(
            aspectRatio: 2 / 3,
            child: SkeletonBlock(radius: 18),
          ),
        ),
      SizedBox(height: onboarding ? 5 : 10),
      SkeletonBlock(
        height: MediaQuery.textScalerOf(context).scale(16),
        width: 110,
        radius: 4,
      ),
      const SizedBox(height: 3),
      SkeletonBlock(
        height: MediaQuery.textScalerOf(context).scale(12),
        width: 85,
        radius: 4,
      ),
    ],
  );
}

class HomeSkeleton extends StatelessWidget {
  const HomeSkeleton({super.key});
  @override
  Widget build(BuildContext context) => NexSkeleton(
    child: Column(
      children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 8, 16, 32),
          child: AspectRatio(
            aspectRatio: .86,
            child: SkeletonBlock(radius: 28),
          ),
        ),
        for (
          var i = 0;
          i < (MediaQuery.sizeOf(context).height / 350).ceil();
          i++
        ) ...[
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 20),
            child: Align(
              alignment: Alignment.centerLeft,
              child: SkeletonBlock(height: 22, width: 190, radius: 4),
            ),
          ),
          const SizedBox(height: 14),
          SizedBox(
            height: 284,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              scrollDirection: Axis.horizontal,
              itemCount: 4,
              separatorBuilder: (_, _) => const SizedBox(width: 13),
              itemBuilder: (_, _) =>
                  const SizedBox(width: 144, child: PosterCardSkeleton()),
            ),
          ),
          const SizedBox(height: 30),
        ],
      ],
    ),
  );
}

class ChannelListSkeleton extends StatelessWidget {
  const ChannelListSkeleton({super.key, this.schedule = false, this.height});
  final bool schedule;
  final double? height;
  @override
  Widget build(BuildContext context) {
    final rowHeight =
        (schedule ? 92.0 : 72.0) +
        (MediaQuery.textScalerOf(context).scale(28) - 28);
    final count = ((height ?? MediaQuery.sizeOf(context).height) / rowHeight)
        .ceil();
    Widget row() => SizedBox(
      height: rowHeight,
      child: ListTile(
        title: const SkeletonBlock(height: 16, width: 150, radius: 4),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SkeletonBlock(height: 12, width: 100, radius: 4),
              if (schedule)
                const Padding(
                  padding: EdgeInsets.only(top: 6),
                  child: SkeletonBlock(height: 12, width: 130, radius: 4),
                ),
            ],
          ),
        ),
        trailing: const SkeletonBlock(height: 24, width: 24, radius: 12),
      ),
    );
    return NexSkeleton(
      child: Column(
        children: List.generate(
          count,
          (_) => schedule ? Card(child: row()) : row(),
        ),
      ),
    );
  }
}

class TvShelvesSkeleton extends StatelessWidget {
  const TvShelvesSkeleton({super.key});
  @override
  Widget build(BuildContext context) {
    final height =
        280.0 +
        (MediaQuery.textScalerOf(context).scale(100) - 100).clamp(0, 200);
    return NexSkeleton(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (
            var i = 0;
            i < (MediaQuery.sizeOf(context).height / (height + 60)).ceil();
            i++
          ) ...[
            const Padding(
              padding: EdgeInsets.fromLTRB(4, 24, 4, 8),
              child: SkeletonBlock(height: 22, width: 150, radius: 4),
            ),
            SizedBox(
              height: height,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: 4,
                separatorBuilder: (_, _) => const SizedBox(width: 12),
                itemBuilder: (_, _) => SizedBox(
                  width: 270,
                  child: Card(
                    margin: EdgeInsets.zero,
                    child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Row(
                            children: [
                              SkeletonBlock(height: 24, width: 24, radius: 12),
                              SizedBox(width: 8),
                              Expanded(
                                child: SkeletonBlock(height: 16, radius: 4),
                              ),
                              SizedBox(width: 12),
                              SkeletonBlock(height: 24, width: 24, radius: 12),
                            ],
                          ),
                          const SizedBox(height: 24),
                          const SkeletonBlock(
                            height: 22,
                            width: 190,
                            radius: 4,
                          ),
                          const SizedBox(height: 8),
                          const SkeletonBlock(
                            height: 22,
                            width: 140,
                            radius: 4,
                          ),
                          const Spacer(),
                          const SkeletonBlock(
                            height: 14,
                            width: 160,
                            radius: 4,
                          ),
                          const SizedBox(height: 10),
                          const SkeletonBlock(height: 4, radius: 4),
                          const SizedBox(height: 18),
                          const SkeletonBlock(
                            height: 16,
                            width: 130,
                            radius: 4,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
