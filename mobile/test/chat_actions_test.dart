import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/screens/chat_screen.dart';
import 'package:nex/src/state/app_controller.dart';
import 'package:nex/src/screens/taste_screen.dart';
import 'package:nex/src/widgets/skeleton.dart';

import 'dart:async';

import 'stable_discovery_test.dart' show MutableApi;

const command = 'Confirm changes 12345678-1234-1234-1234-123456789abc';

class ChatActionsApi extends MutableApi {
  final messages = <String>[];
  final sessions = <String?>[];
  bool clearFails = false;
  int clears = 0;
  Completer<void>? clearPending;
  @override
  Future<void> clearChat() async {
    clears++;
    if (clearPending != null) await clearPending!.future;
    if (clearFails) throw StateError('Unavailable');
  }

  Map<String, dynamic> cards(bool saved) => {
    'type': 'library_changes',
    'status': saved ? 'saved' : 'preview',
    'items': [
      {
        'id': 101,
        'mediaType': 'movie',
        'title': 'Inception',
        'year': 2010,
        'posterUrl': null,
        'changes': [saved ? 'Added to Want to see' : 'add to Want to see'],
      },
      {
        'id': 102,
        'mediaType': 'movie',
        'title': 'The Matrix',
        'year': 1999,
        'posterUrl': null,
        'changes': [
          saved ? 'Marked Seen' : 'mark Seen',
          saved ? 'Rated super like' : 'rate super like',
        ],
      },
    ],
  };
  @override
  Future<Map<String, dynamic>> chat(String message, {String? sessionId}) async {
    messages.add(message);
    sessions.add(sessionId);
    if (message == command) {
      saved.add(101);
      seen.add(102);
      opinions[102] = 'super_like';
      return {
        'sessionId': 'test-session',
        'blocks': [
          {'type': 'confirmation', 'content': 'Saved 2 of 2 titles.'},
          cards(true),
        ],
      };
    }
    return {
      'sessionId': 'test-session',
      'blocks': [
        {'type': 'text', 'content': 'Review 2 titles. Nothing changed yet.'},
        cards(false),
        {
          'type': 'quick_actions',
          'actions': [command],
        },
      ],
    };
  }
}

class TasteChatApi extends ChatActionsApi {
  bool learned = false;
  int tasteReads = 0;
  @override
  Future<Map<String, dynamic>> chat(String message, {String? sessionId}) async {
    learned = true;
    return {
      'sessionId': 'taste-session',
      'blocks': [
        {
          'type': 'confirmation',
          'content': 'I’ve saved that as a long-term taste preference.',
        },
      ],
    };
  }

  @override
  Future<List<Map<String, dynamic>>> list(String path) async {
    if (path != '/api/me/taste') return super.list(path);
    tasteReads++;
    return [
      for (var i = 0; i < 40; i++)
        {
          'dimension': 'genre',
          'key': 'inferred $i',
          'score': -.8,
          'confidence': .7,
          'source': 'dislike',
        },
      if (learned) ...[
        {
          'dimension': 'language',
          'key': 'ko',
          'score': -.9,
          'confidence': .75,
          'source': 'chat_explicit',
        },
        {
          'dimension': 'keyword',
          'key': 'kpop',
          'score': -.9,
          'confidence': .75,
          'source': 'chat_explicit',
        },
        {
          'dimension': 'keyword',
          'key': 'kdrama',
          'score': -.9,
          'confidence': .75,
          'source': 'chat_explicit',
        },
      ],
    ];
  }
}

class LoadingTasteApi extends ChatActionsApi {
  Completer<List<Map<String, dynamic>>>? pendingTaste;
  @override
  Future<List<Map<String, dynamic>>> list(String path) {
    if (path == '/api/me/taste' && pendingTaste != null)
      return pendingTaste!.future;
    return super.list(path);
  }
}

void main() {
  testWidgets(
    'uncached taste shows matching skeletons, retry handles failure',
    (tester) async {
      final api = LoadingTasteApi();
      final container = ProviderContainer(
        overrides: [nexApiClientProvider.overrideWithValue(api)],
      );
      addTearDown(container.dispose);
      await container.read(appControllerProvider.notifier).restoreSession();
      api.pendingTaste = Completer<List<Map<String, dynamic>>>();
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(home: TasteScreen()),
        ),
      );
      await tester.pump();
      expect(find.byType(NexSkeleton), findsWidgets);
      api.pendingTaste!.completeError(StateError('Offline'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Tap to retry'), findsOneWidget);
      api.pendingTaste = Completer<List<Map<String, dynamic>>>();
      await tester.tap(find.textContaining('Tap to retry'));
      await tester.pump();
      api.pendingTaste!.complete([
        {
          'dimension': 'language',
          'key': 'ko',
          'score': -.9,
          'confidence': .75,
          'source': 'chat_explicit',
        },
      ]);
      await tester.pumpAndSettle();
      expect(find.text('Korean-language titles'), findsOneWidget);
      expect(find.byType(NexSkeleton), findsNothing);
    },
  );
  test('clear chat preserves saved flags, handles failures and blocks concurrent sends', () async {
    final api = ChatActionsApi();
    final container = ProviderContainer(
      overrides: [nexApiClientProvider.overrideWithValue(api)],
    );
    addTearDown(container.dispose);
    final controller = container.read(appControllerProvider.notifier);
    await controller.restoreSession();
    await controller.sendChat(command);
    api.clearFails = true;
    expect(await controller.clearChat(), false);
    expect(container.read(appControllerProvider).chatSessionId, 'test-session');
    expect(container.read(appControllerProvider).chatMessages, isNotEmpty);
    api.clearFails = false;
    api.clearPending = Completer<void>();
    final clearing = controller.clearChat();
    await controller.sendChat('must not send');
    expect(api.messages, hasLength(1));
    api.clearPending!.complete();
    expect(await clearing, true);
    final state = container.read(appControllerProvider);
    expect(state.chatMessages, isEmpty);
    expect(state.chatSessionId, isNull);
    expect(state.watchlist, contains('movie:101'));
    expect(state.watched, contains('movie:102'));
    await controller.sendChat('New conversation');
    expect(api.sessions.last, isNull);
  });
  testWidgets('clear chat requires confirmation and returns to empty state', (
    tester,
  ) async {
    final api = ChatActionsApi();
    final container = ProviderContainer(
      overrides: [nexApiClientProvider.overrideWithValue(api)],
    );
    addTearDown(container.dispose);
    final controller = container.read(appControllerProvider.notifier);
    await controller.restoreSession();
    await controller.sendChat('Add Inception');
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: ChatScreen()),
      ),
    );
    await tester.tap(find.byTooltip('Clear chat'));
    await tester.pumpAndSettle();
    expect(
      find.textContaining('saved taste and reminders stay'),
      findsOneWidget,
    );
    await tester.tap(find.text('Keep chat'));
    await tester.pumpAndSettle();
    expect(api.clears, 0);
    await tester.tap(find.byTooltip('Clear chat'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Clear chat'));
    await tester.pumpAndSettle();
    expect(api.clears, 1);
    expect(container.read(appControllerProvider).chatMessages, isEmpty);
    await tester.pump(const Duration(seconds: 6));
  });
  testWidgets(
    'chat preferences refresh Your Taste and stay visible beyond old list limits',
    (tester) async {
      final api = TasteChatApi();
      final container = ProviderContainer(
        overrides: [nexApiClientProvider.overrideWithValue(api)],
      );
      addTearDown(container.dispose);
      final controller = container.read(appControllerProvider.notifier);
      await controller.restoreSession();
      await controller.sendChat(
        "I don't like kpop kdrama or Korean movies and series",
      );
      expect(
        controller.tasteDislikes,
        containsAll(['Korean-language titles', 'K-pop', 'K-drama']),
      );
      expect(
        controller.tasteEntries
            .take(3)
            .every((e) => e['source'] == 'chat_explicit'),
        true,
      );
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(home: TasteScreen()),
        ),
      );
      expect(find.text('Korean-language titles'), findsWidgets);
      expect(find.text('K-pop'), findsWidgets);
      expect(find.text('K-drama'), findsWidgets);
      expect(controller.tasteEntries, hasLength(43));
      final reads = api.tasteReads;
      await tester.scrollUntilVisible(
        find.text('inferred 39'),
        500,
        scrollable: find.byType(Scrollable).first,
        maxScrolls: 40,
      );
      expect(find.text('inferred 39'), findsOneWidget);
      expect(
        api.tasteReads,
        reads,
      ); // Scrolling consumes cached batches, not duplicate network reads.
    },
  );
  testWidgets(
    'oversized pasted title lists are retained, never silently truncated or sent',
    (tester) async {
      final api = ChatActionsApi();
      final container = ProviderContainer(
        overrides: [nexApiClientProvider.overrideWithValue(api)],
      );
      addTearDown(container.dispose);
      await container.read(appControllerProvider.notifier).restoreSession();
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(home: ChatScreen()),
        ),
      );
      final text = 'x' * 16001;
      await tester.enterText(find.byType(TextField), text);
      await tester.tap(find.byTooltip('Send'));
      await tester.pump();
      expect(api.messages, isEmpty);
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        text,
      );
      expect(find.textContaining('Nothing was sent'), findsOneWidget);
      await tester.pump(const Duration(seconds: 6));
    },
  );
  testWidgets(
    'Chat shows clean confirmation labels, sends exact IDs, then refreshes library',
    (tester) async {
      final api = ChatActionsApi();
      final container = ProviderContainer(
        overrides: [nexApiClientProvider.overrideWithValue(api)],
      );
      addTearDown(container.dispose);
      final controller = container.read(appControllerProvider.notifier);
      await controller.restoreSession();
      await controller.sendChat(
        'Add Title 101 and mark Title 102 seen and super like',
      );
      expect(api.saved, isEmpty);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(home: ChatScreen()),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text(command), findsNothing);
      expect(find.text('Review your changes'), findsOneWidget);
      expect(find.text('Review 2 titles. Nothing changed yet.'), findsNothing);
      expect(find.text('1. Inception'), findsOneWidget);
      await tester.ensureVisible(find.text('Confirm changes'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Confirm changes'));
      await tester.pumpAndSettle();
      expect(api.messages.last, command);
      expect(
        container.read(appControllerProvider).watchlist,
        contains('movie:101'),
      );
      expect(
        container.read(appControllerProvider).watched,
        contains('movie:102'),
      );
      expect(
        container.read(appControllerProvider).reactions['movie:102'],
        'super_like',
      );
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Library updated'),
        180,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Library updated'), findsOneWidget);
      expect(find.text('Saved 2 of 2 titles.'), findsNothing);
    },
  );
  testWidgets('help is reachable from Chat and describes real capabilities', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      const ProviderScope(child: MaterialApp(home: ChatScreen())),
    );
    await tester.tap(find.byTooltip('What can Nex do?'));
    await tester.pumpAndSettle();
    expect(find.text('Update your taste'), findsOneWidget);
    expect(find.text('Manage your library'), findsOneWidget);
    await tester.ensureVisible(find.text('Set a TV reminder'));
    expect(find.textContaining('advance minutes'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
