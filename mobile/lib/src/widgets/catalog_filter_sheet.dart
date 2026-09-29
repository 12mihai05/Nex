import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../data/taste_options.dart';
import 'streaming_service_chips.dart';

const seriesGenres = [
  'Action & Adventure',
  'Animation',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Kids',
  'Mystery',
  'News',
  'Reality',
  'Sci-Fi & Fantasy',
  'Soap',
  'Talk',
  'War & Politics',
  'Western',
];

typedef CatalogFilters = ({
  String? genre,
  int? min,
  int? max,
  String watchStatus,
  Set<int>? providers,
});

class CatalogFilterSheet extends StatefulWidget {
  const CatalogFilterSheet({
    super.key,
    required this.type,
    this.genre,
    this.min,
    this.max,
    this.watchStatus = 'new',
    this.services = const {},
    this.providers,
  });
  final String type;
  final String? genre;
  final int? min, max;
  final String watchStatus;
  final Map<int, String> services;
  final Set<int>? providers;
  @override
  State<CatalogFilterSheet> createState() => _CatalogFilterSheetState();
}

class _CatalogFilterSheetState extends State<CatalogFilterSheet> {
  late String? genre = widget.genre;
  late String watchStatus = widget.watchStatus;
  late Set<int> providers = Set.of(
    widget.providers ?? widget.services.keys.toSet(),
  );
  late final minimum = TextEditingController(
    text: widget.min?.toString() ?? '',
  );
  late final maximum = TextEditingController(
    text: widget.max?.toString() ?? '',
  );
  String? error;
  @override
  void dispose() {
    minimum.dispose();
    maximum.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final genres =
        widget.type == 'series'
              ? [...seriesGenres]
              : widget.type == 'movie'
              ? [...onboardingGenres, 'TV Movie']
              : {...onboardingGenres, ...seriesGenres, 'TV Movie'}.toList()
          ..sort();
    return SingleChildScrollView(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          24,
          0,
          24,
          MediaQuery.viewInsetsOf(context).bottom + 24,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Filters', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 20),
            DropdownButtonFormField<String>(
              initialValue: genre ?? '',
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Genre'),
              items: [
                const DropdownMenuItem(value: '', child: Text('All genres')),
                ...genres.map(
                  (g) => DropdownMenuItem(value: g, child: Text(g)),
                ),
              ],
              onChanged: (value) =>
                  setState(() => genre = value == '' ? null : value),
            ),
            const SizedBox(height: 24),
            ...[
              const Text('Movie duration · minutes'),
              if (widget.type != 'movie')
                const Text('Setting a duration switches to Movies.'),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: minimum,
                      keyboardType: TextInputType.number,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(4),
                      ],
                      decoration: const InputDecoration(
                        labelText: 'Minimum',
                        hintText: 'No minimum',
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      controller: maximum,
                      keyboardType: TextInputType.number,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(4),
                      ],
                      decoration: const InputDecoration(
                        labelText: 'Maximum',
                        hintText: 'No maximum',
                      ),
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 24),
            const Text('Viewing'),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                for (final option in [
                  ('new', 'New to me'),
                  ('again', 'Watch again'),
                  ('either', 'Either'),
                ])
                  ChoiceChip(
                    label: Text(option.$2),
                    selected: watchStatus == option.$1,
                    onSelected: (_) => setState(() => watchStatus = option.$1),
                  ),
              ],
            ),
            if (widget.services.isNotEmpty) ...[
              const SizedBox(height: 20),
              const Text('Your streaming services'),
              const Text('Only for this view. Your profile stays the same.'),
              const SizedBox(height: 8),
              StreamingServiceChips(
                services: widget.services,
                selected: providers,
                onChanged: (next) => setState(() {
                  providers = next;
                  error = null;
                }),
              ),
            ],
            if (error != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(
                  error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () {
                if (widget.services.isNotEmpty && providers.isEmpty) {
                  setState(
                    () => error = 'Select at least one streaming service.',
                  );
                  return;
                }
                final min = int.tryParse(minimum.text),
                    max = int.tryParse(maximum.text);
                if ((min != null && (min < 1 || min > 1440)) ||
                    (max != null && (max < 1 || max > 1440)) ||
                    (min != null && max != null && min > max)) {
                  setState(
                    () => error = 'Use 1–1440 minutes, with minimum no greater than maximum.',
                  );
                  return;
                }
                if ((min != null || max != null) &&
                    genre != null &&
                    ![...onboardingGenres, 'TV Movie'].contains(genre)) {
                  setState(
                    () => error = 'Choose a movie genre or All genres when setting a movie duration.',
                  );
                  return;
                }
                Navigator.pop(context, (
                  genre: genre,
                  min: min,
                  max: max,
                  watchStatus: watchStatus,
                  providers: providers.length == widget.services.length
                      ? null
                      : Set<int>.of(providers),
                ));
              },
              child: const Text('Show titles'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, (
                genre: null,
                min: null,
                max: null,
                watchStatus: 'new',
                providers: null,
              )),
              child: const Text('Clear filters'),
            ),
          ],
        ),
      ),
    );
  }
}
