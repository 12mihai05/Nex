import 'dart:math';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/api_client.dart';
import '../data/demo_data.dart';
import '../models/chat_message.dart';
import '../models/content.dart';
import '../models/discovery_rows.dart';
import '../models/tv_program.dart';
import '../services/notification_service.dart';

class AppState {
  const AppState({
    this.authenticated = false,
    this.demoMode = true,
    this.onboardingComplete = false,
    this.busy = false,
    this.remindersEnabled = true,
    this.behaviorPersonalization = true,
    this.error,
    this.appearance = ThemeMode.system,
    this.country = 'RO',
    this.displayName = '',
    this.providers = const {8, 1899, 119},
    this.audioLanguages = const {'original', 'en'},
    this.subtitleLanguages = const {'ro', 'en'},
    this.favoriteIds = const {},
    this.onboardingFavorites = const [],
    this.tasteDescription = '',
    this.genres = const {'Science Fiction', 'Mystery', 'Thriller'},
    this.moods = const {'Cerebral', 'Tense', 'Slow-burn'},
    this.watchlist = const {},
    this.watched = const {},
    this.reactions = const {},
    this.chatMessages = const [],
    this.chatSessionId,
    this.searchResults = const [],
    this.reminderProgramIds = const {},
  });
  final bool authenticated,
      demoMode,
      onboardingComplete,
      busy,
      remindersEnabled,
      behaviorPersonalization;
  final String? error, chatSessionId;
  final ThemeMode appearance;
  final String country, tasteDescription, displayName;
  final Set<int> providers, favoriteIds;
  final Set<String> audioLanguages,
      subtitleLanguages,
      genres,
      moods,
      watchlist,
      watched,
      reminderProgramIds;
  final Map<String, String> reactions;
  final List<ChatMessage> chatMessages;
  final List<ContentItem> searchResults;
  final List<ContentItem> onboardingFavorites;

  AppState copyWith({
    bool? authenticated,
    bool? demoMode,
    bool? onboardingComplete,
    bool? busy,
    bool? remindersEnabled,
    bool? behaviorPersonalization,
    String? error,
    bool clearError = false,
    ThemeMode? appearance,
    String? country,
    String? displayName,
    Set<int>? providers,
    Set<String>? audioLanguages,
    Set<String>? subtitleLanguages,
    Set<int>? favoriteIds,
    List<ContentItem>? onboardingFavorites,
    String? tasteDescription,
    Set<String>? genres,
    Set<String>? moods,
    Set<String>? watchlist,
    Set<String>? watched,
    Map<String, String>? reactions,
    List<ChatMessage>? chatMessages,
    String? chatSessionId,
    List<ContentItem>? searchResults,
    Set<String>? reminderProgramIds,
  }) => AppState(
    authenticated: authenticated ?? this.authenticated,
    demoMode: demoMode ?? this.demoMode,
    onboardingComplete: onboardingComplete ?? this.onboardingComplete,
    busy: busy ?? this.busy,
    remindersEnabled: remindersEnabled ?? this.remindersEnabled,
    behaviorPersonalization:
        behaviorPersonalization ?? this.behaviorPersonalization,
    error: clearError ? null : error ?? this.error,
    appearance: appearance ?? this.appearance,
    country: country ?? this.country,
    displayName: displayName ?? this.displayName,
    providers: providers ?? this.providers,
    audioLanguages: audioLanguages ?? this.audioLanguages,
    subtitleLanguages: subtitleLanguages ?? this.subtitleLanguages,
    favoriteIds: favoriteIds ?? this.favoriteIds,
    onboardingFavorites: onboardingFavorites ?? this.onboardingFavorites,
    tasteDescription: tasteDescription ?? this.tasteDescription,
    genres: genres ?? this.genres,
    moods: moods ?? this.moods,
    watchlist: watchlist ?? this.watchlist,
    watched: watched ?? this.watched,
    reactions: reactions ?? this.reactions,
    chatMessages: chatMessages ?? this.chatMessages,
    chatSessionId: chatSessionId ?? this.chatSessionId,
    searchResults: searchResults ?? this.searchResults,
    reminderProgramIds: reminderProgramIds ?? this.reminderProgramIds,
  );
}

final appControllerProvider = NotifierProvider<AppController, AppState>(
  AppController.new,
);
final nexApiClientProvider = Provider<NexApiClient>((ref) => NexApiClient());

class AppController extends Notifier<AppState> {
  bool get isAuthenticated => state.authenticated;
  late final NexApiClient _api;
  @override
  AppState build() {
    _api = ref.read(nexApiClientProvider);
    return const AppState();
  }

  List<ContentItem> _liveCatalog = [];
  List<ContentItem> _ranked = [];
  List<ContentRow> _discoveryRows = [];
  int _homeGeneration = 0, _nextHomeBatch = 1;
  bool homeBatchLoading = false;
  String? homeBatchError;
  bool get hasMoreHome => !state.demoMode && _nextHomeBatch < 6;

  Future<void> loadMoreHome() async {
    if (!hasMoreHome || homeBatchLoading || state.busy) return;
    final ticket = _homeGeneration;
    homeBatchLoading = true;
    homeBatchError = null;
    state = state.copyWith();
    try {
      final data = await _api.list('/api/discovery?batch=$_nextHomeBatch');
      if (!ref.mounted || ticket != _homeGeneration) return;
      _discoveryRows = appendDiscoveryRows(
        _discoveryRows,
        parseDiscoveryRows(data),
      );
      _nextHomeBatch++;
    } catch (e) {
      if (ref.mounted && ticket == _homeGeneration) {
        homeBatchError = readableApiError(e);
      }
    } finally {
      if (ref.mounted && ticket == _homeGeneration) {
        homeBatchLoading = false;
        state = state.copyWith();
      }
    }
  }

  final _providerCache = <String, Map<int, String>>{};
  int _countryRequest = 0, _searchRequest = 0;
  List<TvProgram> _liveTv = [];
  List<Map<String, dynamic>> _taste = [];
  Map<int, String> _liveProviders = {};
  bool providersLoading = false;
  final Map<String, Map<String, dynamic>> _reminders = {};
  Map<int, String> get availableServices => state.demoMode
      ? const {
          8: 'Netflix',
          1899: 'Max',
          337: 'Disney+',
          119: 'Prime Video',
          1773: 'SkyShowtime',
        }
      : _liveProviders;
  final Map<String, String> _reasons = {};
  DateTime? _rankedAt;
  String? _rankedScope;
  bool recommendationsPending = false;
  Future<void> refreshIfStale() async {
    final scope = '${state.country}:${state.providers.toList()..sort()}';
    if (!state.busy &&
        !state.demoMode &&
        (_rankedScope != scope || _rankedAt == null)) {
      await refreshLive();
    }
  }

  Future<void> _refreshTasteAfterMutation() async {
    recommendationsPending = true;
    if (!state.demoMode) {
      try {
        _taste = await _api.list('/api/me/taste');
      } catch (_) {
        /* Saved flags remain authoritative; retry stats on refresh. */
      }
    }
    state = state.copyWith();
  }

  Future<void> refreshPersonalState() async {
    if (state.demoMode) return;
    final lists = await Future.wait(
      [
        '/api/me/watchlist',
        '/api/me/history',
        '/api/me/feedback',
        '/api/me/taste',
      ].map(_api.list),
    );
    _taste = lists[3];
    for (final r in [...lists[0], ...lists[1]]) {
      final key = '${r['mediaType']}:${r['tmdbId']}';
      if (!_liveCatalog.any((i) => i.key == key)) {
        _rememberTitle(
          ContentItem.fromJson({
            'id': r['tmdbId'],
            'mediaType': r['mediaType'],
            'title': r['titleSnapshot'],
            'posterUrl': r['posterPath'],
            'metadataOnly': true,
          }),
        );
      }
    }
    recommendationsPending = true;
    state = state.copyWith(
      watchlist: lists[0]
          .map((r) => '${r['mediaType']}:${r['tmdbId']}')
          .toSet(),
      watched: lists[1].map((r) => '${r['mediaType']}:${r['tmdbId']}').toSet(),
      reactions: {
        for (final r in lists[2])
          '${r['mediaType']}:${r['tmdbId']}': r['reaction'] as String,
      },
    );
  }

  List<ContentItem> get catalog => state.demoMode ? demoCatalog : _liveCatalog;
  List<TvProgram> get tvPrograms => state.demoMode ? demoTvPrograms() : _liveTv;
  List<String> get tasteLikes => _taste
      .where((s) => (s['score'] as num) > 0 && (s['confidence'] as num) >= .5)
      .map((s) => s['key'] as String)
      .take(12)
      .toList();
  List<String> get tasteDislikes => _taste
      .where((s) => (s['score'] as num) < 0 && (s['confidence'] as num) >= .5)
      .map((s) => s['key'] as String)
      .take(12)
      .toList();
  List<Map<String, dynamic>> get tasteEntries =>
      _taste.where((s) => (s['confidence'] as num) >= .35).take(30).toList();
  Future<void> correctTaste(String dimension, String key, double score) async {
    if (state.demoMode) return;
    await _api.saveTasteSignals([
      {
        'dimension': dimension,
        'key': key,
        'score': score,
        'confidence': 1,
        'evidenceCount': 1,
        'source': 'explicit_edit',
      },
    ]);
    await _refreshTasteAfterMutation();
  }

  String reasonFor(ContentItem item) =>
      _reasons[item.key] ??
      'No personal recommendation explanation is available for this title yet.';
  bool _isNewToViewer(ContentItem item) =>
      !state.watched.contains(item.key) &&
      !state.reactions.containsKey(item.key);
  Iterable<ContentItem> get _freshRanked => _ranked.where(_isNewToViewer);
  Iterable<ContentItem> get _freshDemo => demoCatalog.where(_isNewToViewer);
  ContentItem? get browseHero =>
      state.demoMode ? _freshDemo.firstOrNull : _freshRanked.firstOrNull;
  List<ContentRow> get browseRows => state.demoMode
      ? [
          ContentRow(
            'Top picks for you',
            'Grounded in your taste and services',
            [
              ..._freshDemo.where(
                (item) => item.availability.any(
                  (a) => a.owned && a.access == 'included',
                ),
              ),
            ],
          ),
          ContentRow(
            'Dark & cerebral',
            'A pattern you keep coming back to',
            _freshDemo
                .where(
                  (item) => item.moods.any(
                    (m) => ['Dark', 'Cerebral', 'Tense'].contains(m),
                  ),
                )
                .toList(),
          ),
          ContentRow(
            'Under two hours',
            null,
            _freshDemo
                .where((item) => (item.runtimeMinutes ?? 999) <= 120)
                .toList(),
          ),
          if (state.watchlist.isNotEmpty)
            ContentRow(
              'From your Want to see list',
              'Available now',
              demoCatalog
                  .where((item) => state.watchlist.contains(item.key))
                  .toList(),
            ),
        ].where((row) => row.items.isNotEmpty).take(4).toList()
      : _discoveryRows.isNotEmpty
      ? _discoveryRows
            .map(
              (r) => ContentRow(
                r.title,
                r.subtitle,
                r.items.where(_isNewToViewer).toList(),
              ),
            )
            .where((r) => r.items.isNotEmpty)
            .toList()
      : [
          ContentRow(
            'Top picks for you',
            'Based on your preferences and availability',
            _freshRanked.take(8).toList(),
          ),
          ContentRow(
            'More to discover',
            'Explore beyond your usual favourites',
            _freshRanked.skip(8).toList(),
          ),
          ContentRow(
            'From your Want to see list',
            null,
            catalog.where((i) => state.watchlist.contains(i.key)).toList(),
          ),
        ].where((r) => r.items.isNotEmpty).toList();

  Future<void> refreshLive({Map<String, dynamic>? restoredSettings}) async {
    if (state.busy) return;
    if (state.demoMode) {
      recommendationsPending = false;
      state = state.copyWith();
      return;
    }
    state = state.copyWith(busy: true, clearError: true);
    final ticket = ++_homeGeneration;
    _nextHomeBatch = 1;
    homeBatchLoading = false;
    homeBatchError = null;
    try {
      final settings = restoredSettings ?? await _api.settings();
      if (!ref.mounted || ticket != _homeGeneration) return;
      final profile = settings['profile'] as Map;
      state = state.copyWith(
        displayName: ((settings['user'] as Map?)?['name'] as String? ?? '')
            .trim(),
      );
      final lists = await Future.wait(
        [
          '/api/providers',
          '/api/me/watchlist',
          '/api/me/history',
          '/api/me/feedback',
          '/api/me/reminders',
          '/api/me/taste',
        ].map(_api.list),
      );
      final providers = lists[0];
      if (!ref.mounted || ticket != _homeGeneration) return;
      _liveProviders = {
        for (final p in providers) p['id'] as int: p['name'] as String,
      };
      final languages = settings['languages'] as List;
      state = state.copyWith(
        appearance: ThemeMode.values.byName(profile['appearance'] as String),
        audioLanguages: languages
            .where((l) => l['kind'] == 'audio')
            .map((l) => l['languageCode'] as String)
            .toSet(),
        subtitleLanguages: languages
            .where((l) => l['kind'] == 'subtitle')
            .map((l) => l['languageCode'] as String)
            .toSet(),
      );
      final saved = lists[1];
      final history = lists[2];
      final feedback = lists[3];
      final reminders = lists[4];
      _reminders.clear();
      for (final reminder in reminders.where((r) => r['active'] == true)) {
        _reminders[reminder['epgProgramId'] as String] = reminder;
      }
      _taste = lists[5];
      state = state.copyWith(
        country: profile['country'] as String,
        onboardingComplete: profile['onboardingComplete'] as bool,
        providers: (settings['services'] as List)
            .map((s) => s['providerId'] as int)
            .toSet(),
        watchlist: saved.map((r) => '${r['mediaType']}:${r['tmdbId']}').toSet(),
        watched: history.map((r) => '${r['mediaType']}:${r['tmdbId']}').toSet(),
        reactions: {
          for (final r in feedback)
            '${r['mediaType']}:${r['tmdbId']}': r['reaction'] as String,
        },
        reminderProgramIds: _reminders.keys.toSet(),
        genres: _taste
            .where((s) => s['dimension'] == 'genre' && (s['score'] as num) > 0)
            .map((s) => s['key'] as String)
            .toSet(),
        moods: _taste
            .where((s) => s['dimension'] == 'mood' && (s['score'] as num) > 0)
            .map((s) => s['key'] as String)
            .toSet(),
        remindersEnabled: profile['remindersEnabled'] as bool,
        behaviorPersonalization: profile['behaviorPersonalization'] as bool,
      );
      List<Map<String, dynamic>> shelves = [];
      // Old deployments remain usable during a rolling backend/mobile upgrade.
      try {
        shelves = await _api.list('/api/discovery?batch=0');
      } catch (_) {
        /* Fall back to the existing endpoint. */
      }
      final ranked = shelves.isEmpty
          ? await _api.recommend()
          : shelves
                .expand(
                  (r) => (r['items'] as List).map(
                    (i) => (i as Map).cast<String, dynamic>(),
                  ),
                )
                .toList();
      if (!ref.mounted || ticket != _homeGeneration) return;
      _discoveryRows = shelves
          .map(
            (r) => ContentRow(
              r['title'] as String,
              r['subtitle'] as String?,
              (r['items'] as List)
                  .map(
                    (i) => ContentItem.fromJson(
                      (i['item'] as Map).cast<String, dynamic>(),
                    ),
                  )
                  .toList(),
            ),
          )
          .toList();
      _rankedAt = DateTime.now();
      _rankedScope = '${state.country}:${state.providers.toList()..sort()}';
      recommendationsPending = false;
      _ranked = ranked
          .map(
            (r) => ContentItem.fromJson(
              (r['item'] as Map).cast<String, dynamic>(),
            ),
          )
          .toList();
      for (var i = 0; i < _ranked.length; i++) {
        _reasons[_ranked[i].key] = ranked[i]['reason'] as String;
      }
      // Publish Home now; library artwork and TV are not startup dependencies.
      _liveCatalog = [..._ranked];
      state = state.copyWith(busy: false);
      final library = await Future.wait(
        [...saved, ...history].take(30).map((r) async {
          try {
            return await _api.title(
              r['mediaType'] as String,
              r['tmdbId'] as int,
            );
          } catch (_) {
            return null;
          }
        }),
      );
      if (!ref.mounted || ticket != _homeGeneration) return;
      _liveCatalog = {
        for (final r in [...saved, ...history])
          '${r['mediaType']}:${r['tmdbId']}': ContentItem.fromJson({
            'id': r['tmdbId'],
            'mediaType': r['mediaType'],
            'title': r['titleSnapshot'],
            'posterUrl': r['posterPath'],
            'overview': '',
            'metadataOnly': true,
          }),
        for (final i in [..._ranked, ...library.whereType<ContentItem>()])
          i.key: i,
      }.values.toList();
      // TV failure must not make streaming discovery fail.
      final tv = await _api
          .list('/api/tv/upcoming')
          .catchError((_) => <Map<String, dynamic>>[]);
      if (!ref.mounted || ticket != _homeGeneration) return;
      _liveTv = tv
          .map(
            (i) => TvProgram(
              id: i['id'] as String,
              title: i['title'] as String,
              channel: (i['channel'] as Map)['name'] as String,
              startsAt: DateTime.parse(i['startAt'] as String).toLocal(),
              endsAt: DateTime.parse(i['endAt'] as String).toLocal(),
            ),
          )
          .toList();
      state = state.copyWith();
    } catch (error) {
      if (!ref.mounted || ticket != _homeGeneration) return;
      state = state.copyWith(busy: false, error: readableApiError(error));
    }
  }

  Future<bool> restoreSession({bool background = false}) async {
    try {
      if (!await _api.hasStoredSession()) return false;
      // Validate with the server before exposing authenticated state.
      final settings = await _api.settings();
      state = state.copyWith(
        authenticated: true,
        demoMode: false,
        displayName: ((settings['user'] as Map?)?['name'] as String? ?? '')
            .trim(),
        onboardingComplete:
            (settings['profile'] as Map)['onboardingComplete'] as bool,
      );
      if (background) {
        unawaited(refreshLive(restoredSettings: settings));
      } else {
        await refreshLive(restoredSettings: settings);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  void enterDemo() => state = state.copyWith(
    authenticated: true,
    demoMode: true,
    clearError: true,
  );
  Future<bool> authenticate({
    required bool create,
    required String name,
    required String email,
    required String password,
    String invite = '',
  }) async {
    state = state.copyWith(busy: true, clearError: true);
    try {
      if (create) {
        await _api.signUp(
          name: name,
          email: email,
          password: password,
          inviteCode: invite,
        );
      } else {
        await _api.signIn(email: email, password: password);
      }
      state = state.copyWith(authenticated: true, demoMode: false, busy: false);
      await refreshLive();
      return true;
    } catch (error) {
      state = state.copyWith(busy: false, error: readableApiError(error));
      return false;
    }
  }

  void updateOnboarding({
    String? country,
    Set<int>? providers,
    Set<String>? audio,
    Set<String>? subtitles,
    Set<int>? favorites,
    String? taste,
    Set<String>? genres,
    Set<String>? moods,
  }) => state = state.copyWith(
    country: country,
    providers: providers,
    audioLanguages: audio,
    subtitleLanguages: subtitles,
    favoriteIds: favorites,
    tasteDescription: taste,
    genres: genres,
    moods: moods,
  );
  void toggleOnboardingFavorite(ContentItem item) {
    final items = [...state.onboardingFavorites];
    if (items.any((i) => i.key == item.key)) {
      items.removeWhere((i) => i.key == item.key);
    } else if (items.length < 5) {
      items.add(item);
    }
    state = state.copyWith(onboardingFavorites: items);
  }

  Future<void> finishOnboarding({
    void Function(String)? onPhase,
    List<String> concepts = const [],
  }) async {
    onPhase?.call('Saving your choices');
    if (!state.demoMode) {
      await _api.saveSettings({
        'country': state.country,
        'services': _providerPayload(),
        'audioLanguages': state.audioLanguages.toList(),
        'subtitleLanguages': state.subtitleLanguages.toList(),
        'preferOriginal': state.audioLanguages.contains('original'),
      });
      onPhase?.call('Finding the threads in your taste');
      await _api.analyzeTaste({
        'description': state.tasteDescription,
        'concepts': concepts,
        'favorites':
            (state.onboardingFavorites.isNotEmpty
                    ? state.onboardingFavorites
                    : demoCatalog.where(
                        (item) => state.favoriteIds.contains(item.id),
                      ))
                .map(
                  (item) => {
                    'id': item.id,
                    'mediaType': item.mediaType.name,
                    'title': item.title,
                    'genres': item.genres,
                  },
                )
                .toList(),
        'genres': state.genres.toList(),
        'moods': state.moods.toList(),
      });
    }
    onPhase?.call('Curating your opening night');
    if (!state.demoMode) await refreshLive();
    if (state.error != null) throw StateError(state.error!);
    if (!state.demoMode) await _api.saveSettings({'onboardingComplete': true});
    state = state.copyWith(onboardingComplete: true);
  }

  List<Map<String, Object?>> _providerPayload() => availableServices.entries
      .where((entry) => state.providers.contains(entry.key))
      .map((entry) => {'providerId': entry.key, 'providerName': entry.value})
      .toList();

  Future<void> search(String query) async {
    final ticket = ++_searchRequest;
    if (query.trim().isEmpty) {
      _api.cancelSearch();
      state = state.copyWith(searchResults: const [], clearError: true);
      return;
    }
    if (state.demoMode) {
      final q = query.toLowerCase();
      final results = demoCatalog
          .where(
            (item) => [
              item.title,
              ...item.genres,
              ...item.moods,
              ...item.cast,
            ].any((value) => value.toLowerCase().contains(q)),
          )
          .toList();
      state = state.copyWith(searchResults: results);
      return;
    }
    try {
      final results = await _api.search(query);
      if (ticket == _searchRequest) {
        state = state.copyWith(searchResults: results, clearError: true);
      }
    } catch (error) {
      if (ticket == _searchRequest) {
        state = state.copyWith(error: readableApiError(error));
      }
    }
  }

  Future<void> toggleWatchlist(ContentItem item) async {
    if (!_pendingWatchlist.add(item.key)) return;
    final adding = !state.watchlist.contains(item.key);
    try {
      if (!state.demoMode && adding) {
        await _api.saveWatchlist(item);
      } else if (!state.demoMode) {
        await _api.removeWatchlist(item);
      }
      _rememberTitle(item);
      final next = {...state.watchlist};
      if (adding) {
        next.add(item.key);
      } else {
        next.remove(item.key);
      }
      state = state.copyWith(watchlist: next, clearError: true);
      await _refreshTasteAfterMutation();
    } catch (error) {
      state = state.copyWith(error: readableApiError(error));
    } finally {
      _pendingWatchlist.remove(item.key);
    }
  }

  final _pendingWatchlist = <String>{};

  Future<void> markWatched(ContentItem item) async {
    state = state.copyWith(clearError: true);
    try {
      if (!state.demoMode) await _api.markWatched(item);
      _rememberTitle(item);
      state = state.copyWith(watched: {...state.watched, item.key});
      await _refreshTasteAfterMutation();
    } catch (error) {
      state = state.copyWith(error: readableApiError(error));
    }
  }

  void _rememberTitle(ContentItem item) {
    _liveCatalog = {
      for (final i in [..._liveCatalog, item]) i.key: i,
    }.values.toList();
  }

  Future<void> removeWatched(ContentItem item) async {
    state = state.copyWith(clearError: true);
    try {
      if (!state.demoMode) await _api.removeWatched(item);
      state = state.copyWith(watched: {...state.watched}..remove(item.key));
      await _refreshTasteAfterMutation();
    } catch (error) {
      state = state.copyWith(error: readableApiError(error));
    }
  }

  Future<void> react(ContentItem item, String? reaction) async {
    state = state.copyWith(clearError: true);
    try {
      if (!state.demoMode) {
        if (reaction == null) {
          await _api.clearReaction(item);
        } else {
          await _api.react(item, reaction);
        }
      }
      _rememberTitle(item);
      final next = {...state.reactions};
      if (reaction == null) {
        next.remove(item.key);
      } else {
        next[item.key] = reaction;
      }
      state = state.copyWith(reactions: next);
      await _refreshTasteAfterMutation();
    } catch (error) {
      state = state.copyWith(error: readableApiError(error));
    }
  }

  Future<void> sendChat(String text) async {
    if (text.trim().isEmpty || state.busy) return;
    state = state.copyWith(
      busy: true,
      chatMessages: [
        ...state.chatMessages,
        ChatMessage(fromUser: true, blocks: [TextChatBlock(text.trim())]),
      ],
    );
    if (state.demoMode) {
      final lower = text.toLowerCase();
      if (lower.contains('remind')) {
        final recentTv = state.chatMessages.reversed
            .expand(
              (message) => message.blocks.whereType<TvCarouselChatBlock>(),
            )
            .firstOrNull;
        if (recentTv != null && recentTv.items.isNotEmpty) {
          final position = lower.contains('third')
              ? 2
              : lower.contains('second')
              ? 1
              : 0;
          final program =
              recentTv.items[position.clamp(0, recentTv.items.length - 1)];
          try {
            await setReminder(program, 10);
            state = state.copyWith(
              busy: false,
              chatMessages: [
                ...state.chatMessages,
                ChatMessage(
                  fromUser: false,
                  blocks: [
                    ConfirmationChatBlock(
                      'I’ll remind you about ${program.title} 10 minutes before it starts.',
                    ),
                  ],
                ),
              ],
            );
          } catch (error) {
            state = state.copyWith(
              busy: false,
              chatMessages: [
                ...state.chatMessages,
                const ChatMessage(
                  fromUser: false,
                  blocks: [
                    ConfirmationChatBlock(
                      'I couldn’t schedule that reminder. Check notification permission and try again.',
                    ),
                  ],
                ),
              ],
            );
          }
          return;
        }
      }
      if (lower.contains('add the first') && state.chatMessages.isNotEmpty) {
        await toggleWatchlist(demoCatalog.first);
      }
      final runtimeMatch = RegExp(r'under\s+(\d+)\s*(?:minutes?|mins?)')
          .firstMatch(lower);
      final hourMatch = RegExp(r'under\s+(\d+)\s*hours?').firstMatch(lower);
      final maxMinutes = runtimeMatch != null
          ? int.parse(runtimeMatch[1]!)
          : hourMatch != null
          ? int.parse(hourMatch[1]!) * 60
          : lower.contains('under two hours')
          ? 120
          : null;
      final allServices =
          lower.contains('all services') ||
          lower.contains('outside my subscriptions');
      final items = demoCatalog
          .where(
            (item) =>
                _isNewToViewer(item) &&
                (maxMinutes == null ||
                    (item.runtimeMinutes != null &&
                        item.runtimeMinutes! <= maxMinutes)) &&
                (allServices ||
                    item.availability.any(
                      (a) =>
                          a.access == 'included' &&
                          state.providers.contains(a.providerId),
                    )),
          )
          .take(4)
          .toList();
      final tvRequest = lower.contains('tv') || lower.contains('live');
      final response = ChatMessage(
        fromUser: false,
        blocks: [
          TextChatBlock(
            tvRequest
                ? 'Here’s what is live or starting soon on Romanian TV.'
                : items.isEmpty
                ? 'No demo titles match those constraints.'
                : 'Here are matching examples from the demo catalog.',
          ),
          if (tvRequest)
            TvCarouselChatBlock(tvPrograms)
          else
            CarouselChatBlock(items),
          const ActionsChatBlock([
            'Under 90 minutes',
            'Something lighter',
            'Show all services',
          ]),
        ],
      );
      state = state.copyWith(
        busy: false,
        chatMessages: [...state.chatMessages, response],
      );
      return;
    }
    try {
      final response = await _api.chat(text, sessionId: state.chatSessionId);
      final blocks = <NexChatBlock>[];
      for (final raw in (response['blocks'] as List? ?? [])) {
        final block = (raw as Map).cast<String, dynamic>();
        switch (block['type']) {
          case 'text':
            blocks.add(TextChatBlock(block['content'] as String));
          case 'confirmation':
            final action = block['action'];
            if (action is Map && action['type'] == 'setReminder') {
              try {
                await _scheduleSavedReminder(action.cast<String, dynamic>());
                blocks.add(
                  const ConfirmationChatBlock(
                    'Reminder scheduled on this device.',
                  ),
                );
              } catch (_) {
                blocks.add(
                  const ConfirmationChatBlock(
                    'Notification could not be scheduled. Check device permissions; the new reminder was rolled back.',
                  ),
                );
              }
            } else if (action is Map && action['type'] == 'cancelReminder') {
              final programId = action['epgProgramId'] as String;
              await NotificationService.instance.cancel(
                NotificationService.idFor(programId),
              );
              _reminders.remove(programId);
              state = state.copyWith(
                reminderProgramIds: {...state.reminderProgramIds}
                  ..remove(programId),
              );
              blocks.add(ConfirmationChatBlock(block['content'] as String));
            } else {
              blocks.add(ConfirmationChatBlock(block['content'] as String));
            }
          case 'movie_carousel':
            blocks.add(
              CarouselChatBlock(
                (block['items'] as List)
                    .map(
                      (item) => ContentItem.fromJson(
                        (item as Map).cast<String, dynamic>(),
                      ),
                    )
                    .toList(),
              ),
            );
          case 'tv_carousel':
            blocks.add(
              TvCarouselChatBlock(
                (block['items'] as List).map((raw) {
                  final item = (raw as Map).cast<String, dynamic>();
                  final channel = (item['channel'] as Map)
                      .cast<String, dynamic>();
                  return TvProgram(
                    id: item['id'] as String,
                    title: item['title'] as String,
                    channel: channel['name'] as String,
                    startsAt: DateTime.parse(item['startAt'] as String),
                    endsAt: DateTime.parse(item['endAt'] as String),
                    description: item['description'] as String?,
                    logoUrl: channel['logoUrl'] as String?,
                  );
                }).toList(),
              ),
            );
          case 'quick_actions':
            blocks.add(
              ActionsChatBlock((block['actions'] as List).cast<String>()),
            );
        }
      }
      if (blocks.any((b) => b is ConfirmationChatBlock)) {
        try {
          await refreshPersonalState();
        } catch (_) {
          // The action succeeded; a secondary read must not imply it failed.
          blocks.add(
            const TextChatBlock(
              'Your change was saved. Refresh your library to update its local view.',
            ),
          );
        }
      }
      state = state.copyWith(
        busy: false,
        chatSessionId: response['sessionId'] as String?,
        chatMessages: [
          ...state.chatMessages,
          ChatMessage(fromUser: false, blocks: blocks),
        ],
      );
    } catch (error) {
      state = state.copyWith(
        busy: false,
        error: readableApiError(error),
        chatMessages: [
          ...state.chatMessages,
          const ChatMessage(
            fromUser: false,
            blocks: [
              TextChatBlock(
                'Chat is temporarily unavailable, but Browse and Search still work.',
              ),
            ],
          ),
        ],
      );
    }
  }

  ContentItem pickForMe({
    int? maxMinutes,
    int? minMinutes,
    String mediaType = 'any',
    String? genre,
    String? mood,
    Set<int> excluded = const {},
  }) {
    var choices = demoCatalog
        .where(
          (item) =>
              !excluded.contains(item.id) &&
              (mediaType == 'any' || item.mediaType.name == mediaType) &&
              (genre == null || item.genres.contains(genre)) &&
              (minMinutes == null ||
                  (item.runtimeMinutes ?? 0) >= minMinutes) &&
              _isNewToViewer(item) &&
              (maxMinutes == null ||
                  (item.runtimeMinutes ?? 999) <= maxMinutes) &&
              (mood == null ||
                  mood == 'Use my taste' ||
                  mood == 'Surprise me' ||
                  item.moods.any(
                    (value) => value.toLowerCase() == mood.toLowerCase(),
                  )),
        )
        .toList();
    if (choices.isEmpty) {
      throw StateError(
        'No new title matches those constraints. Try changing a filter.',
      );
    }
    return choices[Random().nextInt(choices.length)];
  }

  Future<ContentItem> pickLive({
    int? maxMinutes,
    int? minMinutes,
    String mediaType = 'any',
    String? genre,
    String? mood,
    Set<int> excluded = const {},
  }) async {
    if (state.demoMode) {
      return pickForMe(
        maxMinutes: maxMinutes,
        minMinutes: minMinutes,
        mediaType: mediaType,
        genre: genre,
        mood: mood,
        excluded: excluded,
      );
    }
    final result = await _api.surprise(
      maxMinutes: maxMinutes,
      minMinutes: minMinutes,
      mediaType: mediaType,
      genre: genre,
      mood: ['Use my taste', 'Surprise me'].contains(mood) ? null : mood,
      excluded: excluded,
    );
    final item = ContentItem.fromJson(
      (result['item'] as Map).cast<String, dynamic>(),
    );
    _reasons[item.key] = result['reason'] as String;
    return item;
  }

  Future<void> rejectPick(ContentItem item) async {
    if (!state.demoMode) await _api.reject(item);
  }

  Future<void> setReminder(TvProgram program, int offsetMinutes) async {
    if (!state.remindersEnabled) {
      throw StateError('Reminders are disabled in Settings.');
    }
    final record = state.demoMode
        ? <String, dynamic>{
            'id': program.id,
            'epgProgramId': program.id,
            'title': program.title,
            'startsAt': program.startsAt.toIso8601String(),
            'offsetMinutes': offsetMinutes,
          }
        : await _api.saveReminder(program.id, offsetMinutes);
    await _scheduleSavedReminder(record);
  }

  Future<void> _scheduleSavedReminder(Map<String, dynamic> record) async {
    final programId = record['epgProgramId'] as String;
    final previous = _reminders[programId];
    try {
      await NotificationService.instance.schedule(
        id: NotificationService.idFor(programId),
        title: record['title'] as String,
        startsAt: DateTime.parse(record['startsAt'] as String),
        offsetMinutes: record['offsetMinutes'] as int,
      );
    } catch (_) {
      if (!state.demoMode) {
        if (previous == null) {
          await _api.cancelReminder(record['id'] as String);
        } else {
          await _api.saveReminder(programId, previous['offsetMinutes'] as int);
        }
      }
      rethrow;
    }
    _reminders[programId] = record;
    state = state.copyWith(
      reminderProgramIds: {...state.reminderProgramIds, programId},
    );
  }

  Future<void> cancelReminder(String programId) async {
    final reminder = _reminders[programId];
    if (!state.demoMode && reminder != null) {
      await _api.cancelReminder(reminder['id'] as String);
    }
    await NotificationService.instance.cancel(
      NotificationService.idFor(programId),
    );
    _reminders.remove(programId);
    state = state.copyWith(
      reminderProgramIds: {...state.reminderProgramIds}..remove(programId),
    );
  }

  void setAppearance(ThemeMode mode) {
    state = state.copyWith(appearance: mode);
    if (!state.demoMode) _api.saveSettings({'appearance': mode.name});
  }

  Future<void> updateCountry(String country) async {
    if (!state.demoMode) {
      await _api.saveSettings({'country': country});
      _liveTv = [];
      _liveCatalog = [];
      _ranked = [];
      _discoveryRows = [];
      state = state.copyWith(country: country);
      await refreshLive();
    } else {
      state = state.copyWith(country: country);
    }
  }

  Future<void> updateOnboardingCountry(String country) async {
    final ticket = ++_countryRequest;
    _liveProviders = _providerCache[country] ?? {};
    providersLoading = !state.demoMode && !_providerCache.containsKey(country);
    state = state.copyWith(country: country, clearError: true);
    if (!state.demoMode) {
      if (_providerCache.containsKey(country)) return;
      try {
        final providers = await _api.list('/api/providers?country=$country');
        final available = {
          for (final p in providers) p['id'] as int: p['name'] as String,
        };
        _providerCache[country] = available;
        if (ticket != _countryRequest) return;
        _liveProviders = available;
      } catch (error) {
        if (ticket == _countryRequest) {
          state = state.copyWith(error: readableApiError(error));
        }
      } finally {
        if (ticket == _countryRequest) providersLoading = false;
      }
    }
    if (ticket == _countryRequest) state = state.copyWith();
  }

  Future<void> saveProviders(Set<int> providers) async {
    state = state.copyWith(providers: providers);
    if (!state.demoMode) {
      await _api.saveSettings({'services': _providerPayload()});
      await refreshLive();
    }
  }

  Future<void> saveLanguages(Set<String> audio, Set<String> subtitles) async {
    state = state.copyWith(audioLanguages: audio, subtitleLanguages: subtitles);
    if (!state.demoMode) {
      await _api.saveSettings({
        'audioLanguages': audio.toList(),
        'subtitleLanguages': subtitles.toList(),
        'preferOriginal': audio.contains('original'),
      });
    }
  }

  Future<void> saveTaste(Set<String> genres, Set<String> moods) async {
    final allGenres = {...state.genres, ...genres},
        allMoods = {...state.moods, ...moods};
    state = state.copyWith(genres: genres, moods: moods);
    if (!state.demoMode) {
      await _api.saveTasteSignals([
        ...allGenres.map(
          (key) => {
            'dimension': 'genre',
            'key': key,
            'score': genres.contains(key) ? 0.9 : 0,
            'confidence': 1,
            'evidenceCount': 1,
            'source': 'explicit_edit',
          },
        ),
        ...allMoods.map(
          (key) => {
            'dimension': 'mood',
            'key': key,
            'score': moods.contains(key) ? 0.9 : 0,
            'confidence': 1,
            'evidenceCount': 1,
            'source': 'explicit_edit',
          },
        ),
      ]);
      await _refreshTasteAfterMutation();
    }
  }

  Future<void> resetTaste() async {
    state = state.copyWith(genres: <String>{}, moods: <String>{});
    if (!state.demoMode) await _api.resetTaste();
  }

  Future<void> setRemindersEnabled(bool value) async {
    if (!state.demoMode) await _api.saveSettings({'remindersEnabled': value});
    if (!value) {
      await NotificationService.instance.cancelAll();
      _reminders.clear();
    }
    state = state.copyWith(
      remindersEnabled: value,
      reminderProgramIds: value ? state.reminderProgramIds : <String>{},
    );
  }

  void setBehaviorPersonalization(bool value) {
    state = state.copyWith(behaviorPersonalization: value);
    if (!state.demoMode) _api.saveSettings({'behaviorPersonalization': value});
  }

  Future<void> signOut() async {
    await NotificationService.instance.cancelAll();
    if (!state.demoMode) await _api.signOut();
    _reminders.clear();
    _clearViewerCache();
    state = const AppState();
  }

  Future<void> deleteAccount({String? password}) async {
    if (!state.demoMode) await _api.deleteAccount(password: password);
    try {
      await NotificationService.instance.cancelAll();
    } finally {
      // Remote deletion is final even if a device notification plugin fails.
      _reminders.clear();
      _clearViewerCache();
      state = const AppState();
    }
  }

  void _clearViewerCache() {
    _homeGeneration++;
    _nextHomeBatch = 1;
    homeBatchLoading = false;
    homeBatchError = null;
    _discoveryRows = [];
    _countryRequest++;
    _searchRequest++;
    _ranked = [];
    _liveCatalog = [];
    _liveTv = [];
    _taste = [];
    _reasons.clear();
    _rankedAt = null;
    _rankedScope = null;
    recommendationsPending = false;
  }
}
