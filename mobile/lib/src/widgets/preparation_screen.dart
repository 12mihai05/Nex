import 'dart:async';

import 'package:flutter/material.dart';

import 'nex_mark.dart';

/// An editorial intermission, not a made-up percentage or timer promise.
class PreparationScreen extends StatefulWidget {
  const PreparationScreen({super.key, required this.phase});
  final String phase;
  @override
  State<PreparationScreen> createState() => _PreparationScreenState();
}

class _PreparationScreenState extends State<PreparationScreen> {
  int frame = 0;
  Timer? timer;
  @override
  void initState() {
    super.initState();
    timer = Timer.periodic(const Duration(seconds: 3), (_) {
      if (mounted && !MediaQuery.disableAnimationsOf(context)) {
        setState(() => frame = (frame + 1) % 3);
      }
    });
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return PopScope(
      canPop: false,
      child: Scaffold(
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const NexMark(size: 48),
                  const SizedBox(height: 12),
                  Text(
                    'NEX  /  OPENING NIGHT',
                    style: Theme.of(context).textTheme.labelLarge
                        ?.copyWith(color: scheme.primary, letterSpacing: 2),
                  ),
                  const SizedBox(height: 40),
                  SizedBox(
                    height: 180,
                    width: 270,
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        for (var i = 0; i < 3; i++)
                          AnimatedPositioned(
                            duration: MediaQuery.disableAnimationsOf(context)
                                ? Duration.zero
                                : const Duration(milliseconds: 600),
                            left: 12 + i * 72,
                            top: i == frame ? 0 : 18,
                            child: Transform.rotate(
                              angle: (i - 1) * .1,
                              child: Container(
                                width: 100,
                                height: 148,
                                decoration: BoxDecoration(
                                  color: i == frame
                                      ? scheme.primary
                                      : scheme.surfaceContainerHighest,
                                  borderRadius: BorderRadius.circular(18),
                                  border: Border.all(
                                    color: scheme.outlineVariant,
                                  ),
                                ),
                                child: Icon(
                                  [
                                    Icons.movie_outlined,
                                    Icons.favorite_outline,
                                    Icons.auto_awesome_outlined,
                                  ][i],
                                  size: 36,
                                  color: i == frame
                                      ? scheme.onPrimary
                                      : scheme.onSurfaceVariant,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 30),
                  Text(
                    'Your taste.\nA world of stories.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.displaySmall,
                  ),
                  const SizedBox(height: 22),
                  Semantics(
                    liveRegion: true,
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 250),
                      child: Text(
                        widget.phase,
                        key: ValueKey(widget.phase),
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'We’re preparing your personal shelves. This can take a little while—please keep Nex open.',
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
