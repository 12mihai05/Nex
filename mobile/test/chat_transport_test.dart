import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/data/api_client.dart';
import 'package:nex/src/data/chat_stream.dart';

class ChatAdapter implements HttpClientAdapter {
  ChatAdapter(
    this.body, {
    this.status = 200,
    this.contentType = 'text/event-stream',
  });
  final String body;
  final int status;
  final String contentType;
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return ResponseBody.fromString(
      body,
      status,
      headers: {
        Headers.contentTypeHeader: [contentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(
    () => FlutterSecureStorage.setMockInitialValues({
      'nex.auth.bearer': 'synthetic-test-token',
    }),
  );
  NexApiClient api(ChatAdapter adapter) => NexApiClient(
    client: Dio(BaseOptions(baseUrl: 'https://example.test'))
      ..httpClientAdapter = adapter,
  );

  test('real client sends one UUID-bearing request and delivers progress then result', () async {
    final adapter = ChatAdapter(
      'event: progress\ndata: {"phase":"read_profile"}\n\nevent: result\ndata: {"data":{"sessionId":"one","blocks":[]}}\n\n',
    );
    final labels = <String>[];
    expect(
      (await api(adapter).chat(
        'My watchlist',
        sessionId: 'one',
        onProgress: labels.add,
      ))['sessionId'],
      'one',
    );
    expect(labels, ['Looking at your saved picks']);
    expect(adapter.requests, hasLength(1));
    expect(
      adapter.requests.single.data['requestId'],
      matches(RegExp(r'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$')),
    );
    expect(adapter.requests.single.headers['Accept'], 'text/event-stream');
    expect(
      adapter.requests.single.headers['Authorization'],
      'Bearer synthetic-test-token',
    );
  });

  test('preserves safe non-2xx server error text instead of a generic stream error', () async {
    final adapter = ChatAdapter(
      '{"error":{"code":"AI_DAILY_LIMIT","message":"Daily AI limit reached."}}',
      status: 429,
      contentType: 'application/json',
    );
    try {
      await api(adapter).chat('Hello');
      fail('Expected request failure');
    } catch (error) {
      expect(readableApiError(error), 'Daily AI limit reached.');
    }
    expect(adapter.requests, hasLength(1));
  });

  test('accepts old JSON deployment and saved idempotent response', () async {
    final adapter = ChatAdapter(
      '{"data":{"sessionId":"saved","blocks":[]}}',
      contentType: 'application/json',
    );
    expect((await api(adapter).chat('Hello'))['sessionId'], 'saved');
  });

  test(
    'does not automatically resend an uncertain interrupted stream',
    () async {
      final adapter = ChatAdapter(
        'event: progress\ndata: {"phase":"prepare_change"}\n\n',
      );
      await expectLater(
        api(adapter).chat('Save this'),
        throwsA(isA<ChatDeliveryException>()),
      );
      expect(adapter.requests, hasLength(1));
    },
  );
  test(
    'malformed streamed data gives safe recovery guidance without resending',
    () async {
      final adapter = ChatAdapter('event: result\ndata: invalid-json\n\n');
      await expectLater(
        api(adapter).chat('Save this'),
        throwsA(isA<ChatDeliveryException>()),
      );
      expect(adapter.requests, hasLength(1));
    },
  );
}
