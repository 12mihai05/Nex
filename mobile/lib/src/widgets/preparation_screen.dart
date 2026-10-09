import 'package:flutter/material.dart';

import 'nex_mark.dart';

/// Only for transitions without usable content. Never delays navigation.
class PreparationScreen extends StatefulWidget {
  const PreparationScreen({super.key, required this.phase});
  final String phase;
  @override
  State<PreparationScreen> createState() => _PreparationScreenState();
}

class _PreparationScreenState extends State<PreparationScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _animation = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _animation.stop();
      _animation.value = 1;
    } else {
      _animation.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _animation.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: false,
    child: Scaffold(
      body: Center(
        child: Semantics(
          label: widget.phase,
          liveRegion: true,
          child: ExcludeSemantics(
            child: FadeTransition(
              opacity: Tween<double>(begin: .55, end: 1).animate(
                CurvedAnimation(parent: _animation, curve: Curves.easeInOut),
              ),
              child: const NexMark(size: 64),
            ),
          ),
        ),
      ),
    ),
  );
}
