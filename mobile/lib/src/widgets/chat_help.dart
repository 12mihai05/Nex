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
        Text(
          'Talk naturally about films, series, TV or Nex. Open a topic for examples.',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: 16),
        const _HelpItem(
          Icons.info_outline,
          'Go beyond the synopsis',
          'Ask about plots, cast, characters, an actor’s other work, directors, episode credits, filming locations, true-story connections or streaming availability. Discuss themes and endings; ask explicitly if you want spoilers. Web-backed answers include source links.\n\nTry: “Who plays this character, and what else have they been in?”',
        ),
        const _HelpItem(
          Icons.movie_outlined,
          'Find your next watch',
          'Combine story ideas, moods, genres, runtime, movies or series, streaming services and new-to-you or rewatch choices. Ask for the same feeling as a film, different recommendations, or the recorded reason behind a suggestion.\n\nTry: “A thoughtful mystery under 100 minutes on my services.”\nThen: “More like these, but lighter.”',
        ),
        const _HelpItem(
          Icons.tune_rounded,
          'Update your taste',
          'Share lasting likes, dislikes and feed exclusions without a special command. Describe themes, people, languages or production countries, or give film examples and explain what you liked. Ask to correct or remove saved preferences, then confirm the preview. Requests just for tonight stay temporary. New Taste affects newly generated recommendations; refresh Home to update its existing feed.\n\nTry: “I enjoy mysteries but dislike graphic violence.”\nOr: “Remove my saved dislike of horror, but keep my other preferences.”',
        ),
        const _HelpItem(
          Icons.bookmark_border_rounded,
          'Manage your library',
          'Add or remove watchlist titles, mark Seen or unseen, and set or clear Like, Super like, Meh or Dislike. You can name up to 50 titles per request. Review the matched titles and confirm before anything changes. Seen, watchlist and ratings are separate.\n\nTry: “Add Interstellar (2014) and The Martian (2015) to my watchlist.”\nOr: “Mark the first film Seen, but don’t rate it.”',
        ),
        const _HelpItem(
          Icons.person_outline_rounded,
          'Ask about your Nex',
          'Read your saved Taste, watchlist, Seen history, ratings, reminders, favourite channels, country or selected streaming services. These questions do not change your data. Change country, services and channel favourites in settings or the TV guide.\n\nTry: “What kind of films do I like?”\nOr: “Have I seen Interstellar, and how did I rate it?”',
        ),
        const _HelpItem(
          Icons.forum_outlined,
          'Follow up naturally',
          'Refer to a recent title or card by name or position. Ask for more choices while keeping your constraints, or combine related questions. Suggestion pills send normal follow-up messages. If “this” could mean several cards, name the title.\n\nTry: “Tell me more about the second one.”\nOr: “What is on this channel, and what follows it?”',
        ),
        const _HelpItem(
          Icons.live_tv_rounded,
          'Check TV listings',
          'Ask what is on now, next or at a particular time, what is worth watching tonight, or what is on your favourite channels. Check whether a named film is in the available TV schedule. Ask what a channel is about or what it usually shows, based on available sources and listings. Your selected country is used unless you name another supported country.\n\nTry: “What’s good on TV tonight?”\nOr: “Will Interstellar be on TV soon?”',
        ),
        const _HelpItem(
          Icons.calendar_month_outlined,
          'Look ahead',
          'Ask about upcoming cinema releases in your country, a film’s release date, new seasons, renewals, delays or cancellation news. Ask for more to continue an upcoming list. Dates can change; an unknown date is not a cancellation, and an original premiere is not necessarily a local streaming date.\n\nTry: “What is coming to cinemas in Romania?”\nOr: “Has another season of Severance been announced?”',
        ),
        const _HelpItem(
          Icons.notifications_none_rounded,
          'Set a TV reminder',
          'Give the programme, channel, day and advance minutes, or refer to a recent broadcast card. An approximate programme time can help find it. Nex verifies the listing and asks you to confirm. You can also ask to read your saved reminders. Phone notification permissions are required; a saved reminder does not prove delivery.\n\nTry: “Remind me 15 minutes before that programme starts.”',
        ),
        const SizedBox(height: 8),
        Text(
          'Include the year when titles share a name. Nex can ask for clarification and can make mistakes: check action previews. Listings, availability and release dates may be incomplete. Personal data and saved actions require sign-in.\n\nClearing Chat removes the conversation, not your saved Taste, library or reminders. Nex helps with entertainment and the app, not unrelated tasks.',
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
    child: Material(
      color: Theme.of(context).colorScheme.surfaceContainer,
      borderRadius: BorderRadius.circular(20),
      clipBehavior: Clip.antiAlias,
      child: ExpansionTile(
        shape: const Border(),
        collapsedShape: const Border(),
        leading: Icon(icon, color: Theme.of(context).colorScheme.primary),
        title: Text(title, style: Theme.of(context).textTheme.titleSmall),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 18),
        children: [
          SelectableText(body, style: Theme.of(context).textTheme.bodyMedium),
        ],
      ),
    ),
  );
}
