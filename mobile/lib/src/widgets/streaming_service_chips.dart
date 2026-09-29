import 'package:flutter/material.dart';

/// Explicit paired colors: FilterChip does not use ChoiceChip's secondary label style.
class StreamingServiceChips extends StatelessWidget {
  const StreamingServiceChips({
    super.key,
    required this.services,
    required this.selected,
    required this.onChanged,
  });
  final Map<int, String> services;
  final Set<int> selected;
  final ValueChanged<Set<int>> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Wrap(
      spacing: 8,
      runSpacing: 6,
      children: [
        for (final service in services.entries)
          FilterChip(
            label: Text(service.value),
            selected: selected.contains(service.key),
            selectedColor: colors.primary,
            backgroundColor: colors.surfaceContainerHighest,
            labelStyle: TextStyle(
              color: selected.contains(service.key)
                  ? colors.onPrimary
                  : colors.onSurface,
            ),
            checkmarkColor: colors.onPrimary,
            onSelected: (value) {
              final next = Set<int>.of(selected);
              value ? next.add(service.key) : next.remove(service.key);
              onChanged(next);
            },
          ),
      ],
    );
  }
}
