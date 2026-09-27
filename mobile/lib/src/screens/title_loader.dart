import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/api_client.dart';
import '../data/demo_data.dart';
import '../models/content.dart';
import '../state/app_controller.dart';
import 'detail_screen.dart';

class TitleLoader extends ConsumerStatefulWidget {
  const TitleLoader({super.key, required this.id, required this.mediaType});
  final int id;
  final String mediaType;
  @override
  ConsumerState<TitleLoader> createState() => _TitleLoaderState();
}

class _TitleLoaderState extends ConsumerState<TitleLoader> {
  late final Future<ContentItem?> item;
  @override
  void initState() {
    super.initState();
    item = ref.read(appControllerProvider).demoMode
        ? Future.value(
            demoCatalog
                .where(
                  (i) =>
                      i.id == widget.id && i.mediaType.name == widget.mediaType,
                )
                .firstOrNull,
          )
        : NexApiClient().title(widget.mediaType, widget.id);
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<ContentItem?>(
    future: item,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) {
        return const Scaffold(body: Center(child: CircularProgressIndicator()));
      }
      if (snapshot.hasError || snapshot.data == null) {
        return Scaffold(
          appBar: AppBar(),
          body: const Center(child: Text('This title could not be loaded.')),
        );
      }
      return DetailScreen(item: snapshot.data!);
    },
  );
}
