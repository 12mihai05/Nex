import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/models/chat_message.dart';
import 'package:nex/src/widgets/knowledge_answer.dart';

void main() {
  testWidgets(
    'knowledge citations are inline buttons and invalid links stay inert',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: KnowledgeAnswer(
              block: KnowledgeChatBlock('Announced. [source] More.', [
                {
                  'title': 'Official announcement',
                  'url': 'https://example.com/news',
                  'start': 11,
                  'end': 19,
                },
                {
                  'title': 'Invalid',
                  'url': 'javascript:alert(1)',
                  'start': 20,
                  'end': 24,
                },
              ]),
            ),
          ),
        ),
      );
      expect(find.byType(TextButton), findsOneWidget);
      expect(find.text('[1]'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
