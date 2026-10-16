import 'content.dart';
import 'tv_program.dart';

String chatActionLabel(String value) => value.replaceFirst(
  RegExp(r'^(Confirm|Cancel) changes [a-f0-9-]{36}$', caseSensitive: false),
  value.toLowerCase().startsWith('cancel')
      ? 'Cancel changes'
      : 'Confirm changes',
);

sealed class NexChatBlock {
  const NexChatBlock();
}

class KnowledgeChatBlock extends NexChatBlock {
  const KnowledgeChatBlock(this.text, this.citations);
  final String text;
  final List<Map<String, dynamic>> citations;
}

class TextChatBlock extends NexChatBlock {
  const TextChatBlock(this.text);
  final String text;
}

class LibraryChangesChatBlock extends NexChatBlock {
  const LibraryChangesChatBlock({required this.saved, required this.items});
  final bool saved;
  final List<LibraryChangeItem> items;
}

class LibraryChangeItem {
  LibraryChangeItem.fromJson(Map<String, dynamic> json)
    : id = json['id'] as int,
      mediaType = json['mediaType'] as String,
      title = json['title'] as String,
      year = json['year'] as int?,
      posterUrl = json['posterUrl'] as String?,
      changes = (json['changes'] as List).cast<String>();
  final int id;
  final String mediaType, title;
  final int? year;
  final String? posterUrl;
  final List<String> changes;
}

class CarouselChatBlock extends NexChatBlock {
  const CarouselChatBlock(this.items);
  final List<ContentItem> items;
}

class TvCarouselChatBlock extends NexChatBlock {
  const TvCarouselChatBlock(this.items);
  final List<TvProgram> items;
}

class ActionsChatBlock extends NexChatBlock {
  const ActionsChatBlock(this.actions);
  final List<String> actions;
}

class ConfirmationChatBlock extends NexChatBlock {
  const ConfirmationChatBlock(this.text);
  final String text;
}

class ChatMessage {
  const ChatMessage({required this.fromUser, required this.blocks});
  final bool fromUser;
  final List<NexChatBlock> blocks;

  // Rendering saved history must never replay a reminder or library mutation.
  factory ChatMessage.fromHistory(Map<String, dynamic> row) {
    final fromUser = row['role'] == 'user';
    final blocks = <NexChatBlock>[];
    for (final raw in row['blocks'] as List? ?? []) {
      final b = raw as Map;
      switch (b['type']) {
        case 'text':
          blocks.add(TextChatBlock(b['content'] as String));
        case 'knowledge':
          blocks.add(
            KnowledgeChatBlock(
              b['content'] as String,
              (b['citations'] as List? ?? [])
                  .map((c) => (c as Map).cast<String, dynamic>())
                  .toList(),
            ),
          );
        case 'confirmation':
          blocks.add(ConfirmationChatBlock(b['content'] as String));
        case 'movie_carousel':
          blocks.add(
            CarouselChatBlock(
              (b['items'] as List)
                  .map(
                    (i) => ContentItem.fromJson(
                      (i as Map).cast<String, dynamic>(),
                    ),
                  )
                  .toList(),
            ),
          );
        case 'tv_carousel':
          blocks.add(
            TvCarouselChatBlock(
              (b['items'] as List)
                  .map(
                    (i) =>
                        TvProgram.fromJson((i as Map).cast<String, dynamic>()),
                  )
                  .toList(),
            ),
          );
        case 'library_changes':
          blocks.add(
            LibraryChangesChatBlock(
              saved: b['status'] == 'saved',
              items: (b['items'] as List)
                  .map(
                    (i) => LibraryChangeItem.fromJson(
                      (i as Map).cast<String, dynamic>(),
                    ),
                  )
                  .toList(),
            ),
          );
        // Saved action buttons may have expired. Preserve the result, not an
        // invitation to replay an old confirmation after reopening the app.
      }
    }
    if (blocks.isEmpty) {
      blocks.add(
        TextChatBlock(
          fromUser
              ? chatActionLabel(row['content'] as String)
              : row['content'] as String,
        ),
      );
    }
    return ChatMessage(fromUser: fromUser, blocks: blocks);
  }
}
