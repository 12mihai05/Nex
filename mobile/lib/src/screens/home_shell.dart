import 'package:flutter/material.dart';

import 'browse_screen.dart';
import 'chat_screen.dart';
import 'tv_screen.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/app_controller.dart';

class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});
  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  var index = 0;
  @override
  Widget build(BuildContext context) => Scaffold(
    body: IndexedStack(
      index: index,
      children: [
        const BrowseScreen(),
        TvScreen(active: index == 1),
        const ChatScreen(),
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
  );
}
