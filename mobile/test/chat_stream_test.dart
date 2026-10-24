import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';

import 'package:nex/src/data/chat_stream.dart';

void main() {
  test(
    'decodes progress and result across every single-byte UTF-8 chunk',
    () async {
      final bytes = utf8.encode(
        'event: progress\r\ndata: {"phase":"recommend"}\r\n\r\n: heartbeat\n\nevent: result\ndata: {"data":{"text":"În seara asta 🎬"}}\n\n',
      );
      final events = await decodeChatEvents(
        Stream.fromIterable(bytes.map((b) => [b])),
      ).toList();
      expect(events.length, 2);
      expect(events.first['event'], 'progress');
      expect(events.last['data']['data']['text'], 'În seara asta 🎬');
    },
  );
  test(
    'does not deliver incomplete final frames or treat pings as answers',
    () async {
      final events = await decodeChatEvents(
        Stream.value(
          utf8.encode(
            'event: ping\ndata: {}\n\nevent: result\ndata: {"partial":true}',
          ),
        ),
      ).toList();
      expect(events.map((e) => e['event']), ['ping']);
    },
  );
  test('malformed JSON is an error, not a successful reply', () async {
    await expectLater(
      decodeChatEvents(
        Stream.value(utf8.encode('event: result\ndata: broken\n\n')),
      ).toList(),
      throwsFormatException,
    );
  });
  test(
    'progress uses friendly labels and never shows unknown internal phases',
    () {
      expect(chatProgressLabel('recommend'), 'Finding a good fit');
      expect(chatProgressLabel('internal_private_state'), 'Thinking');
    },
  );
}
