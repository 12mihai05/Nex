import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../models/tv_program.dart';
import '../state/app_controller.dart';
import 'reminder_sheet.dart';
import 'skeleton.dart';

class ProgrammeSheet extends ConsumerStatefulWidget {
  const ProgrammeSheet({super.key, required this.program, this.saved = false});
  final TvProgram program;
  final bool saved;
  @override
  ConsumerState<ProgrammeSheet> createState() => _ProgrammeSheetState();
}

class _ProgrammeSheetState extends ConsumerState<ProgrammeSheet> {
  bool reminder = false;
  late Future<Map<String, dynamic>> details;
  @override
  void initState() {
    super.initState();
    load();
  }

  void load() {
    details = ref.read(appControllerProvider).demoMode
        ? Future.value({})
        : ref
              .read(nexApiClientProvider)
              .object(
                '/api/tv/programmes/${Uri.encodeComponent(widget.program.id)}',
              );
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.program;
    return PopScope<int>(
      canPop: !reminder,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && reminder) setState(() => reminder = false);
      },
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * .85,
        ),
        child: reminder
            ? ReminderSheet(
                program: p,
                saved: widget.saved,
                onBack: () => setState(() => reminder = false),
              )
            : SafeArea(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        p.title,
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '${p.channel} · ${DateFormat.MMMd().add_Hm().format(p.startsAt)} – ${DateFormat.Hm().format(p.endsAt)}',
                      ),
                      const SizedBox(height: 20),
                      if (p.description?.isNotEmpty == true)
                        SelectableText(
                          p.description!,
                          style: Theme.of(context).textTheme.bodyLarge,
                        ),
                      FutureBuilder<Map<String, dynamic>>(
                        future: details,
                        builder: (context, s) {
                          if (s.connectionState != ConnectionState.done) {
                            return const Padding(
                              padding: EdgeInsets.symmetric(vertical: 18),
                              child: NexSkeleton(
                                child: Column(
                                  children: [
                                    SkeletonBlock(height: 16),
                                    SizedBox(height: 8),
                                    SkeletonBlock(height: 16),
                                    SizedBox(height: 8),
                                    SkeletonBlock(height: 16),
                                  ],
                                ),
                              ),
                            );
                          }
                          if (s.hasError) {
                            return TextButton(
                              onPressed: () => setState(load),
                              child: const Text(
                                'Retry extra programme details',
                              ),
                            );
                          }
                          final d = s.data ?? {};
                          final cast = (d['cast'] as List? ?? [])
                              .cast<String>();
                          return Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              if (d['subtitle'] case final String subtitle)
                                Padding(
                                  padding: const EdgeInsets.only(top: 12),
                                  child: Text(
                                    subtitle,
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleMedium,
                                  ),
                                ),
                              if (d['description'] case final String description
                                  when p.description?.isNotEmpty != true)
                                SelectableText(
                                  description,
                                  style: Theme.of(context).textTheme.bodyLarge,
                                ),
                              if (cast.isNotEmpty) ...[
                                const SizedBox(height: 20),
                                Text(
                                  d['castScope'] == 'series'
                                      ? 'Series cast'
                                      : 'Cast',
                                  style: Theme.of(context)
                                      .textTheme
                                      .titleMedium,
                                ),
                                const SizedBox(height: 8),
                                SelectableText(cast.join(', ')),
                              ],
                              if (d['category'] case final String category)
                                Padding(
                                  padding: const EdgeInsets.only(top: 12),
                                  child: Text(category),
                                ),
                            ],
                          );
                        },
                      ),
                      const SizedBox(height: 24),
                      if (p.startsAt.isAfter(DateTime.now()) || widget.saved)
                        FilledButton.icon(
                          onPressed: () => setState(() => reminder = true),
                          icon: const Icon(Icons.notifications_outlined),
                          label: Text(
                            widget.saved ? 'Edit reminder' : 'Remind me',
                          ),
                        ),
                    ],
                  ),
                ),
              ),
      ),
    );
  }
}
