import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/models/chat_message.dart';
import 'package:nex/src/state/app_controller.dart';

import 'chat_actions_test.dart' show ChatActionsApi;

class HistoryApi extends ChatActionsApi {
  final reads = <String>[];
  Completer<Map<String, dynamic>>? pending;
  bool failOlder = false;
  @override
  Future<Map<String, dynamic>> object(String path) async {
    if (!path.startsWith('/api/chat')) return super.object(path);
    reads.add(path);
    if (pending != null) return pending!.future;
    if (path.contains('before') && failOlder) throw StateError('Offline');
    return {
      'sessionId': 'persisted-session',
      'messages': [
        {
          'role': 'user',
          'content': path.contains('before')
              ? 'Earlier question'
              : 'Recent question',
          'blocks': [],
        },
        {
          'role': 'assistant',
          'content': 'Saved answer',
          'blocks': [
            {'type': 'text', 'content': 'Saved answer'},
            {
              'type': 'quick_actions',
              'actions': ['Confirm old action'],
            },
            {'type': 'reminder_created', 'programId': 'old-program'},
          ],
        },
      ],
      'hasMore': !path.contains('before'),
      'before': path.contains('before') ? 1 : 31,
    };
  }
}

void main() {
  test(
    'history restores once, paginates and retries without replaying actions',
    () async {
      final api = HistoryApi();
      final c = ProviderContainer(
        overrides: [nexApiClientProvider.overrideWithValue(api)],
      );
      addTearDown(c.dispose);
      final controller = c.read(appControllerProvider.notifier);
      await controller.restoreSession();
      await controller.restoreChat();
      await controller.restoreChat();
      expect(api.reads, ['/api/chat']);
      expect(c.read(appControllerProvider).chatSessionId, 'persisted-session');
      expect(
        c.read(appControllerProvider).chatMessages.last.blocks,
        hasLength(1),
      );
      expect(api.messages, isEmpty);
      api.failOlder = true;
      await controller.restoreChat(older: true);
      expect(controller.chatRestoreError, isNotNull);
      api.failOlder = false;
      await controller.restoreChat(older: true);
      expect(controller.chatRestoreError, isNull);
      expect(c.read(appControllerProvider).chatMessages, hasLength(4));
      expect(
        (c.read(appControllerProvider).chatMessages.first.blocks.first
                as TextChatBlock)
            .text,
        'Earlier question',
      );
      expect(controller.chatHasOlder, isFalse);
      await controller.clearChat();
      await controller.restoreChat();
      expect(c.read(appControllerProvider).chatMessages, isEmpty);
      expect(api.clears, 1);
    },
  );
  test(
    'clearing while history is in flight cannot restore deleted messages',
    () async {
      final api = HistoryApi();
      final c = ProviderContainer(
        overrides: [nexApiClientProvider.overrideWithValue(api)],
      );
      addTearDown(c.dispose);
      final controller = c.read(appControllerProvider.notifier);
      await controller.restoreSession();
      api.pending = Completer();
      final restoring = controller.restoreChat();
      await controller.clearChat();
      api.pending!.complete({
        'messages': [
          {'role': 'user', 'content': 'Old message'},
        ],
        'sessionId': 'old',
      });
      await restoring;
      expect(c.read(appControllerProvider).chatMessages, isEmpty);
      expect(c.read(appControllerProvider).chatSessionId, isNull);
    },
  );
}
