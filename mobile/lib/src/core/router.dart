import 'package:go_router/go_router.dart';

import '../screens/title_loader.dart';
import '../models/content.dart';
import '../screens/auth_screen.dart';
import '../screens/chat_screen.dart';
import '../screens/detail_screen.dart';
import '../screens/home_shell.dart';
import '../screens/library_screen.dart';
import '../screens/onboarding_screen.dart';
import '../screens/profile_screen.dart';
import '../screens/search_screen.dart';
import '../screens/settings_screen.dart';
import '../screens/taste_screen.dart';

final router = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(path: '/', builder: (_, _) => const AuthScreen()),
    GoRoute(path: '/onboarding', builder: (_, _) => const OnboardingScreen()),
    GoRoute(path: '/home', builder: (_, _) => const HomeShell()),
    GoRoute(path: '/chat', builder: (_, _) => const ChatScreen()),
    GoRoute(path: '/search', builder: (_, _) => const SearchScreen()),
    GoRoute(path: '/profile', builder: (_, _) => const ProfileScreen()),
    GoRoute(path: '/settings', builder: (_, _) => const SettingsScreen()),
    GoRoute(path: '/taste', builder: (_, _) => const TasteScreen()),
    GoRoute(
      path: '/watchlist',
      builder: (_, _) => const LibraryScreen(watched: false),
    ),
    GoRoute(
      path: '/history',
      builder: (_, _) => const LibraryScreen(watched: true),
    ),
    GoRoute(
      path: '/title/:type/:id',
      builder: (_, state) {
        final extra = state.extra;
        if (extra is ContentItem && !extra.metadataOnly) {
          return DetailScreen(item: extra);
        }
        final id = int.tryParse(state.pathParameters['id'] ?? '');
        return TitleLoader(
          id: id ?? 0,
          mediaType: state.pathParameters['type'] ?? 'movie',
        );
      },
    ),
  ],
);
