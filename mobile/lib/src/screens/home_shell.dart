import 'package:flutter/material.dart';

import 'browse_screen.dart';
import 'chat_screen.dart';
import 'tv_screen.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/app_controller.dart';
import '../services/release_notification_service.dart';

import 'package:go_router/go_router.dart';

class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});
  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  var index = 0;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && !ref.read(appControllerProvider).demoMode) {
        ReleaseNotificationService.instance.start(
          ref.read(nexApiClientProvider),
          (path) {
            if (mounted) context.push(path);
          },
        );
      }
    });
  }

  @override
  void dispose() {
    ReleaseNotificationService.instance.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => PopScope<Object?>(
    canPop: index == 0,
    onPopInvokedWithResult: (didPop, result) {
      if (!didPop && index != 0) {
        setState(() => index = 0);
        ref.read(appControllerProvider.notifier).refreshIfStale();
      }
    },
    child: Scaffold(
      body: IndexedStack(
        index: index,
        children: [
          const BrowseScreen(),
          TvScreen(active: index == 1),
          ChatScreen(active: index == 2),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (value) {
          setState(() => index = value);
          if (value == 0) {
            ref.read(appControllerProvider.notifier).refreshIfStale();
          }
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.movie_filter_outlined),
            selectedIcon: Icon(Icons.movie_filter),
            label: 'Streaming',
          ),
          NavigationDestination(
            icon: Icon(Icons.live_tv_outlined),
            selectedIcon: Icon(Icons.live_tv),
            label: 'TV',
          ),
          NavigationDestination(
            icon: Icon(Icons.chat_bubble_outline),
            selectedIcon: Icon(Icons.chat_bubble),
            label: 'Chat',
          ),
        ],
      ),
    ),
  );
}
