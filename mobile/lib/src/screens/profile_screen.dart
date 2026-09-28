import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../state/app_controller.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(appControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 30),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Row(
                children: [
                  const CircleAvatar(
                    radius: 30,
                    child: Icon(Icons.person_outline, size: 30),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          state.demoMode
                              ? 'Demo viewer'
                              : (state.displayName.isNotEmpty
                                    ? state.displayName
                                    : 'Your profile'),
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        Text(
                          state.demoMode
                              ? 'Local fixture mode'
                              : 'Private account',
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 22),
          _ProfileTile(
            icon: Icons.bookmark_outline,
            title: 'Want to see',
            subtitle: '${state.watchlist.length} saved',
            onTap: () => context.push('/watchlist'),
          ),
          _ProfileTile(
            icon: Icons.history,
            title: 'Seen library',
            subtitle: '${state.watched.length} titles',
            onTap: () => context.push('/history'),
          ),
          _ProfileTile(
            icon: Icons.favorite_outline,
            title: 'Your Taste',
            subtitle: 'See and correct what Nex understands',
            onTap: () => context.push('/taste'),
          ),
          _ProfileTile(
            icon: Icons.settings_outlined,
            title: 'Settings',
            subtitle: 'Watching, appearance, privacy and account',
            onTap: () => context.push('/settings'),
          ),
          const SizedBox(height: 24),
          Text(
            'Nex uses your explicit choices more strongly than searches or detail opens. Temporary moods stay temporary.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ],
      ),
    );
  }
}

class _ProfileTile extends StatelessWidget {
  const _ProfileTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });
  final IconData icon;
  final String title, subtitle;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      minTileHeight: 74,
      leading: Icon(icon),
      title: Text(title),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_right),
      onTap: onTap,
    ),
  );
}
