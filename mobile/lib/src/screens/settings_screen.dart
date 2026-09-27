import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../state/app_controller.dart';
import '../data/countries.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(appControllerProvider);
    final controller = ref.read(appControllerProvider.notifier);
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
        children: [
          const _Header('Watching'),
          Card(
            child: Column(
              children: [
                ListTile(
                  title: const Text('Country'),
                  subtitle: Text(
                    watchingCountries[state.country] ?? state.country,
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => _country(context, controller),
                ),
                ListTile(
                  title: const Text('Streaming services'),
                  subtitle: Text('${state.providers.length} selected'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => _providers(context, state, controller),
                ),
                ListTile(
                  title: const Text('Audio languages'),
                  subtitle: Text(state.audioLanguages.join(', ')),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => _languages(context, state, controller),
                ),
                ListTile(
                  title: const Text('Subtitle languages'),
                  subtitle: Text(state.subtitleLanguages.join(', ')),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => _languages(context, state, controller),
                ),
              ],
            ),
          ),
          const _Header('Your Taste'),
          Card(
            child: Column(
              children: [
                ListTile(
                  title: const Text('Genres & moods'),
                  subtitle: Text(
                    '${state.genres.length + state.moods.length} preferences',
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/taste'),
                ),
                ListTile(
                  title: const Text('Reset personalization'),
                  leading: const Icon(Icons.restart_alt),
                  onTap: () async {
                    if (await _confirm(
                          context,
                          'Reset personalization?',
                          'This removes durable taste signals but keeps your account and watch history.',
                        ) ==
                        true) {
                      await controller.resetTaste();
                    }
                  },
                ),
              ],
            ),
          ),
          const _Header('Notifications'),
          SwitchListTile(
            value: state.remindersEnabled,
            onChanged: controller.setRemindersEnabled,
            title: const Text('TV reminders'),
            subtitle: const Text('Only reminders you explicitly create'),
          ),
          const _Header('Appearance'),
          SegmentedButton<ThemeMode>(
            segments: const [
              ButtonSegment(value: ThemeMode.system, label: Text('System')),
              ButtonSegment(value: ThemeMode.light, label: Text('Light')),
              ButtonSegment(value: ThemeMode.dark, label: Text('Dark')),
            ],
            selected: {state.appearance},
            onSelectionChanged: (value) =>
                controller.setAppearance(value.first),
          ),
          const _Header('Privacy'),
          SwitchListTile(
            value: state.behaviorPersonalization,
            onChanged: controller.setBehaviorPersonalization,
            title: const Text('Use search & Chat behavior'),
            subtitle: const Text(
              'Weak evidence only; explicit feedback remains stronger',
            ),
          ),
          const _Header('About & credits'),
          const Card(
            child: Padding(
              padding: EdgeInsets.all(18),
              child: Text(
                'Nex\n\nThis product uses the TMDB API but is not endorsed or certified by TMDB.\n\nWatch-provider availability is supplied by JustWatch through TMDB.',
              ),
            ),
          ),
          const _Header('Account'),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.logout),
                  title: const Text('Sign out'),
                  onTap: () async {
                    await controller.signOut();
                    if (context.mounted) context.go('/');
                  },
                ),
                ListTile(
                  leading: Icon(
                    Icons.delete_outline,
                    color: Theme.of(context).colorScheme.error,
                  ),
                  title: Text(
                    'Delete account',
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                  onTap: () async {
                    final yes = await _confirm(
                      context,
                      'Delete this account?',
                      'This permanently deletes your Nex data.',
                    );
                    if (yes == true) {
                      await controller.deleteAccount();
                      if (context.mounted) context.go('/');
                    }
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _country(BuildContext context, AppController controller) async {
    final result = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            for (final country in watchingCountries.entries)
              ListTile(
                title: Text(country.value),
                subtitle: country.key == 'MD'
                    ? const Text('Limited TV coverage')
                    : null,
                onTap: () => Navigator.pop(sheetContext, country.key),
              ),
          ],
        ),
      ),
    );
    if (result != null) await controller.updateCountry(result);
  }

  Future<void> _providers(
    BuildContext context,
    AppState state,
    AppController controller,
  ) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) =>
        _ProviderEditor(initial: state.providers, controller: controller),
  );
  Future<void> _languages(
    BuildContext context,
    AppState state,
    AppController controller,
  ) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _LanguageEditor(
      audio: state.audioLanguages,
      subtitles: state.subtitleLanguages,
      controller: controller,
    ),
  );
  Future<bool?> _confirm(BuildContext context, String title, String body) =>
      showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(title),
          content: Text(body),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Continue'),
            ),
          ],
        ),
      );
}

class _Header extends StatelessWidget {
  const _Header(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(8, 26, 8, 8),
    child: Text(
      text.toUpperCase(),
      style: Theme.of(context).textTheme.labelLarge
          ?.copyWith(color: Theme.of(context).colorScheme.primary),
    ),
  );
}

class _ProviderEditor extends StatefulWidget {
  const _ProviderEditor({required this.initial, required this.controller});
  final Set<int> initial;
  final AppController controller;
  @override
  State<_ProviderEditor> createState() => _ProviderEditorState();
}

class _ProviderEditorState extends State<_ProviderEditor> {
  late Set<int> selected = {...widget.initial};
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
    child: SizedBox(
      height: MediaQuery.sizeOf(context).height * .7,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Your services',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 12),
          Expanded(
            child: ListView(
              children: widget.controller.availableServices.entries
                  .map(
                    (provider) => CheckboxListTile(
                      value: selected.contains(provider.key),
                      title: Text(provider.value),
                      onChanged: (_) => setState(
                        () => selected.contains(provider.key)
                            ? selected.remove(provider.key)
                            : selected.add(provider.key),
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
          FilledButton(
            onPressed: () async {
              await widget.controller.saveProviders(selected);
              if (context.mounted) Navigator.pop(context);
            },
            child: const Text('Save services'),
          ),
        ],
      ),
    ),
  );
}

class _LanguageEditor extends StatefulWidget {
  const _LanguageEditor({
    required this.audio,
    required this.subtitles,
    required this.controller,
  });
  final Set<String> audio, subtitles;
  final AppController controller;
  @override
  State<_LanguageEditor> createState() => _LanguageEditorState();
}

class _LanguageEditorState extends State<_LanguageEditor> {
  late Set<String> audio = {...widget.audio};
  late Set<String> subtitles = {...widget.subtitles};
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Language preferences',
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 14),
        Text('Audio', style: Theme.of(context).textTheme.titleLarge),
        Wrap(
          spacing: 8,
          children: ['original', 'ro', 'en']
              .map(
                (value) => FilterChip(
                  label: Text(
                    value == 'original'
                        ? 'Original language'
                        : value.toUpperCase(),
                  ),
                  selected: audio.contains(value),
                  onSelected: (_) => setState(
                    () => audio.contains(value)
                        ? audio.remove(value)
                        : audio.add(value),
                  ),
                ),
              )
              .toList(),
        ),
        const SizedBox(height: 16),
        Text('Subtitles', style: Theme.of(context).textTheme.titleLarge),
        Wrap(
          spacing: 8,
          children: ['ro', 'en', 'none']
              .map(
                (value) => FilterChip(
                  label: Text(value.toUpperCase()),
                  selected: subtitles.contains(value),
                  onSelected: (_) => setState(
                    () => subtitles.contains(value)
                        ? subtitles.remove(value)
                        : subtitles.add(value),
                  ),
                ),
              )
              .toList(),
        ),
        const SizedBox(height: 20),
        FilledButton(
          onPressed: () async {
            await widget.controller.saveLanguages(audio, subtitles);
            if (context.mounted) Navigator.pop(context);
          },
          child: const Text('Save languages'),
        ),
      ],
    ),
  );
}
