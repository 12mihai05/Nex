import 'content.dart';
import 'tv_program.dart';

sealed class NexChatBlock {
  const NexChatBlock();
}

class TextChatBlock extends NexChatBlock {
  const TextChatBlock(this.text);
  final String text;
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
