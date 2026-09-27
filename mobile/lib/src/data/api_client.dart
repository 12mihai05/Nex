import 'package:dio/dio.dart';
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
        headers: {'Accept': 'application/json'},
      ),
    );
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _storage.read(key: _tokenKey);
          if (token != null) options.headers['Authorization'] = 'Bearer $token';
          handler.next(options);
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

  Future<bool> hasStoredSession() async =>
      (await _storage.read(key: _tokenKey))?.isNotEmpty ?? false;

  Future<void> signUp({
    required String name,
    required String email,
    required String password,
    required String inviteCode,
  }) async {
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
      await _storage.delete(key: _tokenKey);
    }
  }

  Future<void> deleteAccount() async {
    await _dio.post<void>('/api/auth/delete-user', data: <String, dynamic>{});
    await _storage.delete(key: _tokenKey);
  }

  Future<List<ContentItem>> search(String query) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/api/search',
      queryParameters: {'q': query},
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
  Future<List<Map<String, dynamic>>> list(String path) async =>
      (((await _dio.get<Map<String, dynamic>>(path)).data!['data'] as List).map(
        (r) => (r as Map).cast<String, dynamic>(),
      )).toList();
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
    String? mood,
    Set<int> excluded = const {},
  }) async =>
      ((await _dio.post<Map<String, dynamic>>(
                '/api/surprise',
                data: {
                  'maxRuntimeMinutes': maxMinutes,
                  'mood': mood,
                  'excludedIds': excluded.toList(),
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
    if (error.type == DioExceptionType.connectionError ||
        error.type == DioExceptionType.connectionTimeout) {
      return 'The Nex service is unavailable. Check your connection and try again.';
    }
  }
  return 'Something went wrong. Please try again.';
}
