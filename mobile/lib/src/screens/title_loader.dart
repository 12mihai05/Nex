import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/demo_data.dart';
import '../models/content.dart';
import '../state/app_controller.dart';
import '../widgets/skeleton.dart';
import 'detail_screen.dart';

class TitleLoader extends ConsumerStatefulWidget {
  const TitleLoader({super.key, required this.id, required this.mediaType});
  final int id;
  final String mediaType;
  @override
  ConsumerState<TitleLoader> createState() => _TitleLoaderState();
}

class _TitleLoaderState extends ConsumerState<TitleLoader> {
  late Future<ContentItem?> item;
  @override
  void initState() {
    super.initState();
    load();
  }

  void load() {
    item = ref.read(appControllerProvider).demoMode
        ? Future.value(
            demoCatalog
                .where(
                  (i) =>
                      i.id == widget.id && i.mediaType.name == widget.mediaType,
                )
                .firstOrNull,
          )
        : ref.read(nexApiClientProvider).title(widget.mediaType, widget.id);
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<ContentItem?>(
    future: item,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) {
        return Scaffold(
          appBar: AppBar(),
          body: const Padding(
            padding: EdgeInsets.all(20),
            child: NexSkeleton(
              child: Column(
                children: [
                  SkeletonBlock(height: 240),
                  SizedBox(height: 24),
                  SkeletonBlock(height: 28),
                  SizedBox(height: 16),
                  SkeletonBlock(height: 100),
                ],
              ),
            ),
          ),
        );
      }
      if (snapshot.hasError || snapshot.data == null) {
        return Scaffold(
          appBar: AppBar(),
          body: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('This title could not be loaded.'),
                TextButton(
                  onPressed: () => setState(load),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        );
      }
      return DetailScreen(item: snapshot.data!);
    },
  );
}
