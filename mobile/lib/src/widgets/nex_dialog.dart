import 'package:flutter/material.dart';

/// Shared treatment for centered dialogs, not sheets or full-screen editors.
class NexDialog extends StatelessWidget {
  const NexDialog({
    super.key,
    required this.title,
    required this.content,
    required this.actions,
    this.icon = Icons.info_outline_rounded,
  });
  final String title;
  final Widget content;
  final List<Widget> actions;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return AlertDialog(
      scrollable: true,
      iconPadding: const EdgeInsets.fromLTRB(24, 24, 24, 0),
      icon: Align(
        alignment: Alignment.centerLeft,
        child: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: scheme.primary.withValues(alpha: .12),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: scheme.primary.withValues(alpha: .2)),
          ),
          child: Icon(icon, color: scheme.primary, size: 25),
        ),
      ),
      titlePadding: const EdgeInsets.fromLTRB(24, 20, 24, 0),
      title: Align(alignment: Alignment.centerLeft, child: Text(title)),
      contentPadding: const EdgeInsets.fromLTRB(24, 12, 24, 26),
      content: content,
      actionsPadding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
      actionsOverflowButtonSpacing: 8,
      actions: actions,
    );
  }
}
