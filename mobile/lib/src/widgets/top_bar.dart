import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'nex_mark.dart';

class NexTopBar extends StatelessWidget implements PreferredSizeWidget {
  const NexTopBar({super.key, this.title = 'Nex'});
  final String title;
  @override
  Size get preferredSize => const Size.fromHeight(64);
  @override
  Widget build(BuildContext context) => AppBar(
    titleSpacing: 20,
    backgroundColor: Colors.transparent,
    scrolledUnderElevation: 0,
    title: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const NexMark(size: 32),
        const SizedBox(width: 8),
        Text(
          title,
          style: const TextStyle(
            fontSize: 25,
            fontWeight: FontWeight.w800,
            letterSpacing: -1,
          ),
        ),
      ],
    ),
    actions: [
      IconButton(
        tooltip: 'Search',
        onPressed: () => context.push('/search'),
        icon: const Icon(Icons.search_rounded),
      ),
      IconButton(
        tooltip: 'Profile',
        onPressed: () => context.push('/profile'),
        icon: const CircleAvatar(
          radius: 17,
          child: Icon(Icons.person_outline, size: 20),
        ),
      ),
      const SizedBox(width: 10),
    ],
  );
}
