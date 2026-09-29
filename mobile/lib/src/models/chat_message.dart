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
}
