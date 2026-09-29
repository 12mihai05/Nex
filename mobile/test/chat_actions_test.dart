import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/screens/chat_screen.dart';
import 'package:nex/src/state/app_controller.dart';

import 'stable_discovery_test.dart' show MutableApi;

const command = 'Confirm changes 12345678-1234-1234-1234-123456789abc';

class ChatActionsApi extends MutableApi {
  final messages = <String>[];
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

void main() {
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
      await tester.scrollUntilVisible(find.text('Library updated'), 180, scrollable: find.byType(Scrollable).first);
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
