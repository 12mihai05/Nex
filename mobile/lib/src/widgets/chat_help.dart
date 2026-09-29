import 'package:flutter/material.dart';

void showChatHelp(BuildContext context) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  showDragHandle: true,
  builder: (context) => SingleChildScrollView(
    padding: const EdgeInsets.fromLTRB(24, 0, 24, 28),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                'What can Nex do?',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
            ),
            IconButton(
              tooltip: 'Close help',
              onPressed: () => Navigator.pop(context),
              icon: const Icon(Icons.close_rounded),
            ),
          ],
        ),
        const SizedBox(height: 12),
        const _HelpItem(
          Icons.movie_outlined,
          'Find your next watch',
          'Describe a story, mood, genre or time limit. Mention the services you want.',
        ),
        const _HelpItem(
          Icons.tune_rounded,
          'Update your taste',
          'Tell me lasting likes and dislikes: “I like mysteries, but dislike graphic violence.” Wishes just for tonight stay temporary.',
        ),
        const _HelpItem(
          Icons.bookmark_border_rounded,
          'Manage your library',
          'Ask to add or remove titles, mark Seen, or rate Like, Super like, Meh or Dislike. Review the cards and confirm. Up to 50 titles per request.',
        ),
        const _HelpItem(
          Icons.live_tv_rounded,
          'Check TV listings',
          'Ask “What’s on ProTV today at 8pm?” I use your selected country unless you name another.',
        ),
        const _HelpItem(
          Icons.notifications_none_rounded,
          'Set a TV reminder',
          'Give the programme, channel, day and advance minutes. I verify the listing and ask you to confirm. Phone notification permissions are required.',
        ),
        const SizedBox(height: 8),
        Text(
          'Be specific when titles share a name—include the year. If a title or TV listing is unclear, I’ll ask rather than guess. Library actions and reminders require sign-in.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    ),
  ),
);

class _HelpItem extends StatelessWidget {
  const _HelpItem(this.icon, this.title, this.body);
  final IconData icon;
  final String title, body;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 18),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: Theme.of(context).colorScheme.primary),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 4),
              Text(body, style: Theme.of(context).textTheme.bodyMedium),
            ],
          ),
        ),
      ],
    ),
  );
}
