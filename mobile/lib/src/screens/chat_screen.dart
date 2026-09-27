import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/chat_message.dart';
import '../models/tv_program.dart';
import '../state/app_controller.dart';
import '../widgets/content_card.dart';
import '../widgets/top_bar.dart';

class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key});
  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final input = TextEditingController();
  final scroll = ScrollController();
  @override
  void dispose() {
    input.dispose();
    scroll.dispose();
    super.dispose();
  }

  Future<void> send([String? prompt]) async {
    final text = prompt ?? input.text;
    if (text.trim().isEmpty) return;
    input.clear();
    await ref.read(appControllerProvider.notifier).sendChat(text);
    await Future<void>.delayed(const Duration(milliseconds: 80));
    if (scroll.hasClients) {
      scroll.animateTo(
        scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOut,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(appControllerProvider);
    return Scaffold(
      appBar: const NexTopBar(title: 'Ask Nex'),
      body: Column(
        children: [
          Expanded(
            child: state.chatMessages.isEmpty
                ? _EmptyChat(onPrompt: send)
                : ListView.separated(
                    controller: scroll,
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
                    itemCount: state.chatMessages.length + (state.busy ? 1 : 0),
                    separatorBuilder: (_, _) => const SizedBox(height: 18),
                    itemBuilder: (_, index) {
                      if (index == state.chatMessages.length) {
                        return const Align(
                          alignment: Alignment.centerLeft,
                          child: Padding(
                            padding: EdgeInsets.all(14),
                            child: SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                          ),
                        );
                      }
                      return _Message(
                        message: state.chatMessages[index],
                        onPrompt: send,
                      );
                    },
                  ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: TextField(
                      controller: input,
                      minLines: 1,
                      maxLines: 5,
                      textCapitalization: TextCapitalization.sentences,
                      onSubmitted: (_) => send(),
                      decoration: const InputDecoration(
                        hintText: 'What are you in the mood for?',
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    tooltip: 'Send',
                    onPressed: state.busy ? null : send,
                    icon: const Icon(Icons.arrow_upward_rounded),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyChat extends StatelessWidget {
  const _EmptyChat({required this.onPrompt});
  final ValueChanged<String> onPrompt;
  @override
  Widget build(BuildContext context) => Center(
    child: SingleChildScrollView(
      padding: const EdgeInsets.all(28),
      child: Column(
        children: [
          Icon(
            Icons.forum_outlined,
            size: 42,
            color: Theme.of(context).colorScheme.primary,
          ),
          const SizedBox(height: 20),
          Text(
            'Say what you actually mean.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.displaySmall,
          ),
          const SizedBox(height: 10),
          Text(
            'Nex turns the messy version of your mood into real options you can watch.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyLarge,
          ),
          const SizedBox(height: 28),
          for (final prompt in [
            'I have 1 hour 45 and want something tense.',
            'What’s good on TV tonight?',
            'Something like Arrival, but less slow.',
          ])
            Padding(
              padding: const EdgeInsets.only(bottom: 9),
              child: OutlinedButton(
                onPressed: () => onPrompt(prompt),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(prompt),
                ),
              ),
            ),
        ],
      ),
    ),
  );
}

class _Message extends StatelessWidget {
  const _Message({required this.message, required this.onPrompt});
  final ChatMessage message;
  final ValueChanged<String> onPrompt;
  @override
  Widget build(BuildContext context) => Align(
    alignment: message.fromUser ? Alignment.centerRight : Alignment.centerLeft,
    child: ConstrainedBox(
      constraints: BoxConstraints(maxWidth: message.fromUser ? 330 : 600),
      child: Column(
        crossAxisAlignment: message.fromUser
            ? CrossAxisAlignment.end
            : CrossAxisAlignment.start,
        children: message.blocks
            .map(
              (block) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: switch (block) {
                  TextChatBlock() => Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 13,
                    ),
                    decoration: BoxDecoration(
                      color: message.fromUser
                          ? Theme.of(context).colorScheme.primary
                          : Theme.of(context).cardTheme.color,
                      borderRadius: BorderRadius.circular(19),
                    ),
                    child: Text(
                      block.text,
                      style: TextStyle(
                        color: message.fromUser
                            ? Theme.of(context).colorScheme.onPrimary
                            : null,
                      ),
                    ),
                  ),
                  ConfirmationChatBlock() => Container(
                    padding: const EdgeInsets.all(15),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.primaryContainer,
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.check_circle_outline),
                        const SizedBox(width: 9),
                        Flexible(child: Text(block.text)),
                      ],
                    ),
                  ),
                  CarouselChatBlock() => SizedBox(
                    height: 282,
                    width: MediaQuery.sizeOf(context).width - 32,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: block.items.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 12),
                      itemBuilder: (_, index) =>
                          ContentCard(item: block.items[index], width: 140),
                    ),
                  ),
                  TvCarouselChatBlock() => SizedBox(
                    height: 150,
                    width: MediaQuery.sizeOf(context).width - 32,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: block.items.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 10),
                      itemBuilder: (_, index) =>
                          _ChatTvCard(program: block.items[index]),
                    ),
                  ),
                  ActionsChatBlock() => Wrap(
                    spacing: 8,
                    runSpacing: 7,
                    children: block.actions
                        .map(
                          (action) => ActionChip(
                            label: Text(action),
                            onPressed: () => onPrompt(action),
                          ),
                        )
                        .toList(),
                  ),
                },
              ),
            )
            .toList(),
      ),
    ),
  );
}

class _ChatTvCard extends StatelessWidget {
  const _ChatTvCard({required this.program});
  final TvProgram program;
  @override
  Widget build(BuildContext context) => Container(
    width: 230,
    padding: const EdgeInsets.all(15),
    decoration: BoxDecoration(
      color: Theme.of(context).cardTheme.color,
      borderRadius: BorderRadius.circular(18),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(
              program.isLive ? Icons.sensors : Icons.schedule,
              size: 17,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(width: 7),
            Expanded(
              child: Text(
                program.isLive ? 'LIVE · ${program.channel}' : program.channel,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.labelLarge,
              ),
            ),
          ],
        ),
        const Spacer(),
        Text(
          program.title,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 5),
        Text(
          '${TimeOfDay.fromDateTime(program.startsAt).format(context)} – ${TimeOfDay.fromDateTime(program.endsAt).format(context)}',
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    ),
  );
}
