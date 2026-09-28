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
          body: CustomScrollView(
            slivers: [
              const SliverAppBar(
                expandedHeight: 320,
                pinned: true,
                flexibleSpace: FlexibleSpaceBar(
                  background: NexSkeleton(
                    child: SkeletonBlock(height: 320, radius: 0),
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 22, 20, 36),
                  child: NexSkeleton(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SkeletonBlock(height: 32, width: 230, radius: 4),
                        const SizedBox(height: 7),
                        const SkeletonBlock(height: 18, width: 170, radius: 4),
                        const SizedBox(height: 12),
                        const Wrap(
                          spacing: 7,
                          children: [
                            SkeletonBlock(height: 38, width: 80, radius: 14),
                            SkeletonBlock(height: 38, width: 100, radius: 14),
                          ],
                        ),
                        const SizedBox(height: 24),
                        for (
                          var i = 0;
                          i < (MediaQuery.sizeOf(context).height / 80).ceil();
                          i++
                        )
                          const Padding(
                            padding: EdgeInsets.only(bottom: 10),
                            child: SkeletonBlock(height: 16, radius: 4),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
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
