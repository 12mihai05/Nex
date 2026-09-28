import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/router.dart';
import 'core/theme.dart';
import 'state/app_controller.dart';

class NexApp extends ConsumerWidget {
  const NexApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final appearance = ref.watch(
      appControllerProvider.select((state) => state.appearance),
    );
    return MaterialApp.router(
      title: 'Nex',
      debugShowCheckedModeBanner: false,
      theme: NexTheme.light,
      darkTheme: NexTheme.dark,
      themeMode: appearance,
      routerConfig: router,
      builder: (context, child) => AnnotatedRegion<SystemUiOverlayStyle>(
        value: NexTheme.systemBars(Theme.of(context).brightness),
        child: child!,
      ),
    );
  }
}
