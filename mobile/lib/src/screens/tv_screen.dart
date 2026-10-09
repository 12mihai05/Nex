import 'package:flutter/material.dart';
import 'tv_guide_screen.dart';

/// Retains the existing router entry while presenting one unified guide.
class TvScreen extends StatelessWidget {
  const TvScreen({super.key, this.active = true, this.initialGuide = false});
  final bool active;
  final bool initialGuide;
  @override
  Widget build(BuildContext context) => TvGuideScreen(active: active);
}
