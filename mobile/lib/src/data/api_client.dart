import 'package:dio/dio.dart';

import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../models/content.dart';

class NexApiClient {
  NexApiClient({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage() {
    _dio = Dio(
      BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 120),
        // Native clients do not add Origin automatically. Better Auth requires
        // a trusted origin for production credential/session mutations.
        headers: {
          'Accept': 'application/json',
          'Origin': Uri.parse(baseUrl).origin,
        },
      ),
    );
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _storage.read(key: _tokenKey);
          if (token != null) options.headers['Authorization'] = 'Bearer $token';
          handler.next(options);
        },
        onResponse: (response, handler) async {
          final renewed = response.headers.value('set-auth-token');
          if (renewed != null && renewed.isNotEmpty) {
            await _storage.write(key: _tokenKey, value: renewed);
          }
          handler.next(response);
        },
      ),
    );
  }

  static const baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:8787',
  );
  static const _tokenKey = 'nex.auth.bearer';
  final FlutterSecureStorage _storage;
  late final Dio _dio;
  CancelToken? _searchCancel;
  void cancelSearch() {
    _searchCancel?.cancel();
  }

  Future<bool> hasStoredSession() async =>
      (await _storage.read(key: _tokenKey))?.isNotEmpty ?? false;

  Future<void> signUp({
    required String name,
    required String email,
    required String password,
    required String inviteCode,
  }) async {
    _resetHomePlans();
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/auth/sign-up/email',
      data: {
        'name': name,
        'email': email,
        'password': password,
        'inviteCode': inviteCode,
      },
    );
    await _captureToken(response);
  }

  Future<void> signIn({required String email, required String password}) async {
    _resetHomePlans();
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/auth/sign-in/email',
      data: {'email': email, 'password': password},
    );
    await _captureToken(response);
  }

  Future<void> signOut() async {
    try {
      await _dio.post<void>('/api/auth/sign-out', data: <String, dynamic>{});
    } finally {
      _resetHomePlans();
      await _storage.delete(key: _tokenKey);
    }
  }

  Future<void> deleteAccount({String? password}) async {
    await _dio.post<void>(
      '/api/auth/delete-user',
      data: <String, dynamic>{'password': ?password},
    );
    _resetHomePlans();
    await _storage.delete(key: _tokenKey);
  }

  Future<List<ContentItem>> search(String query) =>
      _searchTitles(query, 'title');
  Future<List<ContentItem>> searchOnboarding(String query) =>
      _searchTitles(query, 'onboarding');
  Future<List<ContentItem>> _searchTitles(String query, String mode) async {
    cancelSearch();
    _searchCancel = CancelToken();
    final response = await _dio.get<Map<String, dynamic>>(
      '/api/search',
      queryParameters: {'q': query, 'mode': mode},
      cancelToken: _searchCancel,
    );
    return ((response.data?['data'] as List?) ?? [])
        .map(
          (item) => ContentItem.fromJson((item as Map).cast<String, dynamic>()),
        )
        .toList();
  }

  Future<List<Map<String, dynamic>>> recommend() async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/recommend',
      data: {'filter': <String, dynamic>{}},
    );
    return ((response.data?['data'] as List?) ?? [])
        .map((item) => (item as Map).cast<String, dynamic>())
        .toList();
  }

  Future<Map<String, dynamic>> filteredCatalog(
    Map<String, dynamic> filters,
  ) async => (await _dio.get<Map<String, dynamic>>(
    '/api/catalog',
    queryParameters: filters,
  )).data!;

  Future<void> clearChat() => _dio.delete<void>('/api/chat');

  Future<Map<String, dynamic>> chat(String message, {String? sessionId}) async {
    final data = <String, dynamic>{'message': message};
    if (sessionId case final value?) data['sessionId'] = value;
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/chat',
      data: data,
    );
    return (response.data?['data'] as Map).cast<String, dynamic>();
  }

  Future<void> saveWatchlist(ContentItem item) => _dio.post<void>(
    '/api/me/watchlist',
    data: {
      'tmdbId': item.id,
      'mediaType': item.mediaType.name,
      'title': item.title,
      'posterUrl': item.posterUrl,
    },
  );
  Future<void> removeWatchlist(ContentItem item) =>
      _dio.delete<void>('/api/me/watchlist/${item.mediaType.name}/${item.id}');
  Future<void> markWatched(ContentItem item) => _dio.post<void>(
    '/api/me/history',
    data: {
      'tmdbId': item.id,
      'mediaType': item.mediaType.name,
      'title': item.title,
      'posterUrl': item.posterUrl,
    },
  );
  Future<void> removeWatched(ContentItem item) =>
      _dio.delete<void>('/api/me/history/${item.mediaType.name}/${item.id}');
  Future<void> clearReaction(ContentItem item) =>
      _dio.delete<void>('/api/me/feedback/${item.mediaType.name}/${item.id}');
  Future<void> react(ContentItem item, String reaction) => _dio.put<void>(
    '/api/me/feedback',
    data: {
      'tmdbId': item.id,
      'mediaType': item.mediaType.name,
      'reaction': reaction,
    },
  );
  Future<void> saveSettings(Map<String, dynamic> data) =>
      _dio.put<void>('/api/me/settings', data: data);
  Future<void> saveTasteSignals(List<Map<String, dynamic>> signals) =>
      _dio.put<void>('/api/me/taste', data: {'signals': signals});
  Future<void> resetTaste() => _dio.delete<void>('/api/me/taste');
  Future<Map<String, dynamic>> saveReminder(
    String epgProgramId,
    int offsetMinutes,
  ) async =>
      ((await _dio.post<Map<String, dynamic>>(
                '/api/me/reminders',
                data: {
                  'epgProgramId': epgProgramId,
                  'offsetMinutes': offsetMinutes,
                },
              )).data!['data']
              as Map)
          .cast<String, dynamic>();
  Future<void> cancelReminder(String id) =>
      _dio.delete<void>('/api/me/reminders/$id');
  Future<Map<String, dynamic>> settings() async =>
      ((await _dio.get<Map<String, dynamic>>('/api/me/settings')).data!['data']
              as Map)
          .cast<String, dynamic>();
  final _homePlans = <String, String>{};
  final _planVersions = <String, int>{};
  int _planSerial = 0, _planEpoch = 0;
  void _resetHomePlans() {
    _homePlans.clear();
    _planVersions.clear();
    _planEpoch++;
  }

  Future<Map<String, dynamic>> object(String path) async =>
      ((await _dio.get<Map<String, dynamic>>(path)).data!['data'] as Map)
          .cast<String, dynamic>();
  Future<List<Map<String, dynamic>>> list(String path) async {
    final epoch = _planEpoch;
    var uri = Uri.parse(path);
    final params = Map<String, String>.from(uri.queryParameters);
    final discovery = uri.path == '/api/discovery';
    final keyEntries = params.entries.where((e) => e.key != 'batch').toList()
      ..sort((a, b) => a.key.compareTo(b.key));
    final key = keyEntries.map((e) => '${e.key}=${e.value}').join('&');
    final version = discovery && params['batch'] == '0' ? ++_planSerial : null;
    if (version != null) _planVersions[key] = version;
    if (discovery && params['batch'] != '0' && _homePlans.containsKey(key)) {
      params['plan'] = _homePlans[key]!;
      uri = uri.replace(queryParameters: params);
    }
    final response = (await _dio.get<Map<String, dynamic>>(uri.toString()))
        .data!;
    if (discovery &&
        epoch == _planEpoch &&
        _planVersions[key] == version &&
        params['batch'] == '0' &&
        response['meta']?['plan'] is List) {
      if (_homePlans.length >= 16) _homePlans.clear();
      _homePlans[key] = jsonEncode(response['meta']['plan']);
    }
    return (response['data'] as List)
        .map((r) => (r as Map).cast<String, dynamic>())
        .toList();
  }

  Future<Map<String, dynamic>> tvDiscover() async =>
      ((await _dio.get<Map<String, dynamic>>('/api/tv/discover')).data!['data']
              as Map)
          .cast<String, dynamic>();
  Future<void> setChannelFavorite(String channelId, bool favorite) =>
      _dio.put<void>(
        '/api/me/channel-favorites',
        data: {'channelId': channelId, 'favorite': favorite},
      );
  Future<ContentItem> title(String type, int id) async => ContentItem.fromJson(
    ((await _dio.get<Map<String, dynamic>>('/api/title/$type/$id'))
                .data!['data']
            as Map)
        .cast<String, dynamic>(),
  );
  Future<Map<String, dynamic>> surprise({
    int? maxMinutes,
    int? minMinutes,
    String mediaType = 'any',
    String? genre,
    String? mood,
    Set<int> excluded = const {},
    Set<int>? providers,
    String watchStatus = 'new',
  }) async =>
      ((await _dio.post<Map<String, dynamic>>(
                '/api/surprise',
                data: {
                  'maxRuntimeMinutes': maxMinutes,
                  'minRuntimeMinutes': minMinutes,
                  'mediaType': mediaType,
                  'genres': [?genre],
                  'mood': mood,
                  'excludedIds': excluded.toList(),
                  if (providers != null)
                    'providerIds': providers.toList()..sort(),
                  'watchStatus': watchStatus,
                },
              )).data!['data']
              as Map)
          .cast<String, dynamic>();
  Future<void> reject(ContentItem item) => _dio.post<void>(
    '/api/me/rejections',
    data: {'mediaType': item.mediaType.name, 'tmdbId': item.id},
  );
  Future<Map<String, dynamic>> analyzeTaste(Map<String, dynamic> data) async =>
      ((await _dio.post<Map<String, dynamic>>(
                '/api/onboarding/analyze',
                data: data,
              )).data?['data']
              as Map)
          .cast<String, dynamic>();

  Future<void> _captureToken(Response<dynamic> response) async {
    final token = response.headers.value('set-auth-token');
    if (token == null || token.isEmpty) {
      throw StateError('The backend did not return a mobile bearer token.');
    }
    await _storage.write(key: _tokenKey, value: token);
  }
}

String readableApiError(Object error) {
  if (error is DioException) {
    final body = error.response?.data;
    if (body is Map && body['error'] is Map) {
      return (body['error']['message'] as String?) ??
          'Nex could not complete that request.';
    }
    if (body is Map && body['code'] == 'INVALID_PASSWORD') {
      return 'That password is incorrect. Your account has not been deleted.';
    }
    if (body is Map && body['code'] == 'SESSION_EXPIRED') {
      return 'Please confirm your current password or sign in again to delete your account.';
    }
    if (error.type == DioExceptionType.connectionError ||
        error.type == DioExceptionType.connectionTimeout) {
      return 'The Nex service is unavailable. Check your connection and try again.';
    }
  }
  return 'Something went wrong. Please try again.';
}
