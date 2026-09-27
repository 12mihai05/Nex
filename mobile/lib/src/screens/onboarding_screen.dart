import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/demo_data.dart';
import '../data/countries.dart';
import '../state/app_controller.dart';
import '../widgets/artwork.dart';

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});
  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  var step = 0;
  final taste = TextEditingController();
  static const genres = [
    'Science Fiction',
    'Mystery',
    'Thriller',
    'Drama',
    'Comedy',
    'Crime',
    'Animation',
    'Fantasy',
  ];
  static const moods = [
    'Cerebral',
    'Tense',
    'Dark',
    'Feel-good',
    'Cozy',
    'Funny',
    'Emotional',
    'Intense',
    'Weird',
    'Fast-paced',
    'Slow-burn',
  ];
  @override
  void dispose() {
    taste.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(appControllerProvider);
    final controller = ref.read(appControllerProvider.notifier);
    final providers = controller.availableServices;
    final pages = <Widget>[
      _ChoiceStep(
        icon: Icons.public,
        title: 'Where do you watch from?',
        subtitle: 'This shapes streaming availability and TV schedules.',
        child: Column(
          children: [
            for (final country in watchingCountries.entries)
              _SelectTile(
                title: country.value,
                subtitle: country.key == 'MD' ? 'Limited TV coverage' : null,
                selected: state.country == country.key,
                onTap: () => controller.updateOnboardingCountry(country.key),
              ),
          ],
        ),
      ),
      _ChoiceStep(
        icon: Icons.connected_tv,
        title: 'Which services are yours?',
        subtitle: 'Recommendations prioritize things already included for you.',
        child: Wrap(
          spacing: 10,
          runSpacing: 10,
          children: providers.entries
              .map(
                (entry) => FilterChip(
                  label: Text(entry.value),
                  selected: state.providers.contains(entry.key),
                  onSelected: (_) {
                    final next = {...state.providers};
                    next.contains(entry.key)
                        ? next.remove(entry.key)
                        : next.add(entry.key);
                    controller.updateOnboarding(providers: next);
                  },
                ),
              )
              .toList(),
        ),
      ),
      _ChoiceStep(
        icon: Icons.subtitles_outlined,
        title: 'How do you watch?',
        subtitle: 'Audio and subtitles are stored independently.',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Audio', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            _languageChips(state.audioLanguages, [
              'original',
              'ro',
              'en',
            ], (next) => controller.updateOnboarding(audio: next)),
            const SizedBox(height: 24),
            Text('Subtitles', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            _languageChips(state.subtitleLanguages, [
              'ro',
              'en',
              'none',
            ], (next) => controller.updateOnboarding(subtitles: next)),
          ],
        ),
      ),
      _ChoiceStep(
        icon: Icons.favorite_outline,
        title: 'Give us up to 5 you love.',
        subtitle:
            'These are a starting point, not a permanent definition of you.',
        child: SizedBox(
          height: 380,
          child: GridView.builder(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              childAspectRatio: .58,
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
            ),
            itemCount: demoCatalog.length,
            itemBuilder: (_, index) {
              final item = demoCatalog[index];
              final selected = state.favoriteIds.contains(item.id);
              return GestureDetector(
                onTap: () {
                  final next = {...state.favoriteIds};
                  if (selected) {
                    next.remove(item.id);
                  } else if (next.length < 5) {
                    next.add(item.id);
                  }
                  controller.updateOnboarding(favorites: next);
                },
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Artwork(url: item.posterUrl, borderRadius: 14),
                    if (selected)
                      DecoratedBox(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color: Theme.of(context).colorScheme.primary,
                            width: 3,
                          ),
                          color: Colors.black26,
                        ),
                        child: const Align(
                          alignment: Alignment.topRight,
                          child: Padding(
                            padding: EdgeInsets.all(7),
                            child: CircleAvatar(
                              radius: 13,
                              child: Icon(Icons.check, size: 16),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
      _ChoiceStep(
        icon: Icons.auto_awesome_outlined,
        title: 'What makes something good for you?',
        subtitle:
            'Use your own words. Nex turns this into editable taste signals.',
        child: TextField(
          controller: taste,
          minLines: 6,
          maxLines: 10,
          onChanged: (value) => controller.updateOnboarding(taste: value),
          decoration: const InputDecoration(
            hintText: 'I like complicated stories, sci-fi, mysteries and plot twists. Slow is fine if the story is good. I dislike musicals and heavy gore.',
          ),
        ),
      ),
      _ChoiceStep(
        icon: Icons.tune,
        title: 'A little more texture.',
        subtitle: 'Choose only what feels true. You can change this later.',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Genres', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            _toggleChips(
              genres,
              state.genres,
              (next) => controller.updateOnboarding(genres: next),
            ),
            const SizedBox(height: 22),
            Text(
              'Moods & style',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            _toggleChips(
              moods,
              state.moods,
              (next) => controller.updateOnboarding(moods: next),
            ),
          ],
        ),
      ),
    ];
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
              child: Row(
                children: [
                  Text('Nex', style: Theme.of(context).textTheme.titleLarge),
                  const Spacer(),
                  Text(
                    '${step + 1} / ${pages.length}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: LinearProgressIndicator(
                value: (step + 1) / pages.length,
                minHeight: 3,
                borderRadius: BorderRadius.circular(3),
              ),
            ),
            Expanded(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 260),
                child: SingleChildScrollView(
                  key: ValueKey(step),
                  padding: const EdgeInsets.fromLTRB(24, 34, 24, 16),
                  child: pages[step],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
              child: Row(
                children: [
                  if (step > 0)
                    IconButton(
                      onPressed: () => setState(() => step--),
                      icon: const Icon(Icons.arrow_back),
                    ),
                  const Spacer(),
                  FilledButton.icon(
                    onPressed: () async {
                      if (step < pages.length - 1) {
                        setState(() => step++);
                      } else {
                        await controller.finishOnboarding();
                        if (context.mounted) context.go('/home');
                      }
                    },
                    label: Text(
                      step == pages.length - 1 ? 'Build my Nex' : 'Continue',
                    ),
                    iconAlignment: IconAlignment.end,
                    icon: Icon(
                      step == pages.length - 1
                          ? Icons.auto_awesome
                          : Icons.arrow_forward,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _languageChips(
    Set<String> selected,
    List<String> choices,
    ValueChanged<Set<String>> onChanged,
  ) => Wrap(
    spacing: 8,
    children: choices
        .map(
          (value) => FilterChip(
            label: Text(
              value == 'original' ? 'Original language' : value.toUpperCase(),
            ),
            selected: selected.contains(value),
            onSelected: (_) {
              final next = {...selected};
              next.contains(value) ? next.remove(value) : next.add(value);
              onChanged(next);
            },
          ),
        )
        .toList(),
  );
  Widget _toggleChips(
    List<String> choices,
    Set<String> selected,
    ValueChanged<Set<String>> onChanged,
  ) => Wrap(
    spacing: 8,
    runSpacing: 7,
    children: choices
        .map(
          (value) => FilterChip(
            label: Text(value),
            selected: selected.contains(value),
            onSelected: (_) {
              final next = {...selected};
              next.contains(value) ? next.remove(value) : next.add(value);
              onChanged(next);
            },
          ),
        )
        .toList(),
  );
}

class _ChoiceStep extends StatelessWidget {
  const _ChoiceStep({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.child,
  });
  final IconData icon;
  final String title, subtitle;
  final Widget child;
  @override
  Widget build(BuildContext context) => ConstrainedBox(
    constraints: const BoxConstraints(maxWidth: 560),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 34, color: Theme.of(context).colorScheme.primary),
        const SizedBox(height: 22),
        Text(title, style: Theme.of(context).textTheme.displaySmall),
        const SizedBox(height: 10),
        Text(subtitle, style: Theme.of(context).textTheme.bodyLarge),
        const SizedBox(height: 30),
        child,
      ],
    ),
  );
}

class _SelectTile extends StatelessWidget {
  const _SelectTile({
    required this.title,
    this.subtitle,
    required this.selected,
    required this.onTap,
  });
  final String title;
  final String? subtitle;
  final bool selected;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      minTileHeight: 68,
      onTap: onTap,
      title: Text(title),
      subtitle: subtitle == null ? null : Text(subtitle!),
      trailing: Icon(
        selected ? Icons.radio_button_checked : Icons.radio_button_off,
        color: selected ? Theme.of(context).colorScheme.primary : null,
      ),
    ),
  );
}
