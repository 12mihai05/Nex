import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/app_controller.dart';

class TasteScreen extends ConsumerWidget {
  const TasteScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(appControllerProvider);
    final controller = ref.read(appControllerProvider.notifier);
    return Scaffold(
      appBar: AppBar(title: const Text('Your Taste')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        children: [
          Text(
            'Personalization you can understand.',
            style: Theme.of(context).textTheme.displaySmall,
          ),
          const SizedBox(height: 10),
          Text(
            'These are durable preferences. What you want tonight lives separately and expires.',
            style: Theme.of(context).textTheme.bodyLarge,
          ),
          const SizedBox(height: 28),
          _TasteGroup(
            title: 'You tend to love',
            values: state.demoMode
                ? [...state.moods, ...state.genres.take(3)]
                : controller.tasteLikes,
            color: Theme.of(context).colorScheme.primaryContainer,
          ),
          const SizedBox(height: 16),
          _TasteGroup(
            title: 'Usually not your thing',
            values: state.demoMode
                ? const ['Musicals', 'Heavy gore']
                : controller.tasteDislikes,
          ),
          if (!state.demoMode)
            ...controller.tasteEntries.map(
              (entry) => ListTile(
                title: Text(entry['key'] as String),
                subtitle: Text(
                  'Learned from ${(entry['sources'] as List? ?? [entry['source']]).join(', ').replaceAll('_', ' ')}',
                ),
                trailing: PopupMenuButton<double>(
                  tooltip: 'Correct this preference',
                  onSelected: (value) => controller.correctTaste(
                    entry['dimension'] as String,
                    entry['key'] as String,
                    value,
                  ),
                  itemBuilder: (_) => const [
                    PopupMenuItem(value: 1, child: Text('I prefer this')),
                    PopupMenuItem(value: -1, child: Text('Avoid this')),
                    PopupMenuItem(value: 0, child: Text('No preference')),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 26),
          OutlinedButton.icon(
            onPressed: () => showModalBottomSheet<void>(
              context: context,
              isScrollControlled: true,
              showDragHandle: true,
              builder: (_) => _EditTaste(state: state, controller: controller),
            ),
            icon: const Icon(Icons.edit_outlined),
            label: const Text('Edit preferences'),
          ),
        ],
      ),
    );
  }
}

class _TasteGroup extends StatelessWidget {
  const _TasteGroup({required this.title, required this.values, this.color});
  final String title;
  final Iterable<String> values;
  final Color? color;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(19),
    decoration: BoxDecoration(
      color: color ?? Theme.of(context).cardTheme.color,
      borderRadius: BorderRadius.circular(20),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: values.map((value) => Chip(label: Text(value))).toList(),
        ),
      ],
    ),
  );
}

class _EditTaste extends StatefulWidget {
  const _EditTaste({required this.state, required this.controller});
  final AppState state;
  final AppController controller;
  @override
  State<_EditTaste> createState() => _EditTasteState();
}

class _EditTasteState extends State<_EditTaste> {
  late Set<String> moods = {...widget.state.moods};
  late Set<String> genres = {...widget.state.genres};
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Edit preferences',
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 18),
        Text('Moods', style: Theme.of(context).textTheme.titleLarge),
        Wrap(
          spacing: 8,
          children:
              [
                    'Cerebral',
                    'Tense',
                    'Dark',
                    'Feel-good',
                    'Cozy',
                    'Funny',
                    'Emotional',
                    'Intense',
                    'Weird',
                    'Slow-burn',
                  ]
                  .map(
                    (value) => FilterChip(
                      label: Text(value),
                      selected: moods.contains(value),
                      onSelected: (_) => setState(
                        () => moods.contains(value)
                            ? moods.remove(value)
                            : moods.add(value),
                      ),
                    ),
                  )
                  .toList(),
        ),
        const SizedBox(height: 20),
        FilledButton(
          onPressed: () async {
            await widget.controller.saveTaste(genres, moods);
            if (context.mounted) Navigator.pop(context);
          },
          child: const Text('Save strong preference correction'),
        ),
      ],
    ),
  );
}
