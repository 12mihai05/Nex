import 'package:flutter/material.dart';

import '../widgets/nex_dialog.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/chat_message.dart';
import '../models/tv_program.dart';
import '../state/app_controller.dart';
import '../widgets/content_card.dart';
import '../widgets/top_bar.dart';
import '../widgets/nex_notice.dart';
import '../widgets/chat_library_changes.dart';
import '../widgets/chat_help.dart';
import '../widgets/knowledge_answer.dart';

class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key, this.active = true});
  final bool active;
  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final input = TextEditingController();
  final scroll = ScrollController();
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && widget.active) restore();
    });
  }

  Future<void> restore() async {
    final shouldScroll =
        !ref.read(appControllerProvider).demoMode &&
        ref.read(appControllerProvider).chatMessages.isEmpty;
    await ref.read(appControllerProvider.notifier).restoreChat();
    if (!mounted || !shouldScroll) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && scroll.hasClients) {
        scroll.jumpTo(scroll.position.maxScrollExtent);
      }
    });
  }

  @override
  void didUpdateWidget(ChatScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.active && !oldWidget.active) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) restore();
      });
    }
  }

  @override
  void dispose() {
    input.dispose();
    scroll.dispose();
    super.dispose();
  }

  Future<void> send([String? prompt]) async {
    final controller = ref.read(appControllerProvider.notifier);
    if (controller.chatRestoring || controller.chatRestoreError != null) return;
    if (ref.read(appControllerProvider).busy) return;
    final text = prompt ?? input.text;
    if (text.trim().isEmpty) return;
    if (text.length > 16000) {
      showNexNotice(
        context,
        'This message is too long. Split it into smaller groups of up to 50 titles. Nothing was sent.',
      );
      return;
    }
    if (prompt == null) input.clear();
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

  Future<void> clearChat() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => NexDialog(
        title: 'Clear chat?',
        icon: Icons.chat_bubble_outline_rounded,
        content: const Text(
          'This deletes your chat history and resets the conversation. Your watchlist, Seen titles, ratings, saved taste and reminders stay as they are.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep chat'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Clear chat'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    final cleared = await ref.read(appControllerProvider.notifier).clearChat();
    if (!mounted) return;
    if (cleared) input.clear();
    showNexNotice(
      context,
      cleared ? 'Chat cleared' : 'Could not clear chat. Please try again.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(appControllerProvider);
    final controller = ref.read(appControllerProvider.notifier);
    final latestAssistant = state.chatMessages.lastIndexWhere(
      (m) => !m.fromUser,
    );
    return Scaffold(
      appBar: NexTopBar(
        title: 'Ask Nex',
        showSearch: false,
        extraActions: [
          IconButton(
            tooltip: 'What can Nex do?',
            onPressed: () => showChatHelp(context),
            icon: const Icon(Icons.help_outline_rounded),
          ),
          IconButton(
            tooltip: 'Clear chat',
            onPressed: state.busy ? null : clearChat,
            icon: const Icon(Icons.delete_outline_rounded),
          ),
        ],
      ),
      body: Column(
        children: [
          if (controller.chatRestoring)
            const LinearProgressIndicator(minHeight: 2),
          if (controller.chatRestoreError != null)
            TextButton(
              onPressed: () => controller.restoreChat(
                older: controller.chatRestored && !controller.chatNeedsRecovery,
              ),
              child: Text(controller.chatRestoreError!),
            )
          else if (controller.chatNeedsRecovery)
            TextButton.icon(
              onPressed: controller.chatRestoring
                  ? null
                  : () => controller.restoreChat(),
              icon: const Icon(Icons.sync_rounded),
              label: const Text('Check saved reply'),
            )
          else if (controller.chatHasOlder)
            TextButton(
              onPressed: controller.chatRestoring
                  ? null
                  : () async {
                      final before = scroll.hasClients
                          ? scroll.position.maxScrollExtent
                          : 0.0;
                      final position = scroll.hasClients ? scroll.offset : 0.0;
                      await controller.restoreChat(older: true);
                      WidgetsBinding.instance.addPostFrameCallback((_) {
                        if (mounted && scroll.hasClients) {
                          scroll.jumpTo(
                            position + scroll.position.maxScrollExtent - before,
                          );
                        }
                      });
                    },
              child: const Text('Earlier messages'),
            ),
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
                        return Align(
                          alignment: Alignment.centerLeft,
                          child: Padding(
                            padding: const EdgeInsets.all(14),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Flexible(
                                  child: Text(
                                    controller.chatProgress,
                                    style: Theme.of(context)
                                        .textTheme
                                        .bodyMedium
                                        ?.copyWith(
                                          color: Theme.of(context)
                                              .colorScheme
                                              .onSurfaceVariant,
                                        ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      }
                      return _Message(
                        message: state.chatMessages[index],
                        onPrompt: send,
                        actionsEnabled: !state.busy && index == latestAssistant,
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
                    onPressed:
                        state.busy ||
                            controller.chatRestoring ||
                            controller.chatRestoreError != null
                        ? null
                        : send,
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
  const _Message({
    required this.message,
    required this.onPrompt,
    required this.actionsEnabled,
  });
  final ChatMessage message;
  final ValueChanged<String> onPrompt;
  final bool actionsEnabled;
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
                  KnowledgeChatBlock() => KnowledgeAnswer(block: block),
                  LibraryChangesChatBlock() => ChatLibraryChanges(block: block),
                  TextChatBlock() => Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 13,
                    ),
                    decoration: BoxDecoration(
                      color: message.fromUser
                          ? Theme.of(context).colorScheme.primary
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(19),
                    ),
                    child: SelectableText(
                      block.text,
                      style: TextStyle(
                        fontSize: 16,
                        height: 1.5,
                        color: message.fromUser
                            ? Theme.of(context).colorScheme.onPrimary
                            : Theme.of(context).colorScheme.onSurface,
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
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.check_circle_outline,
                          color: Theme.of(context)
                              .colorScheme
                              .onPrimaryContainer,
                        ),
                        const SizedBox(width: 9),
                        Flexible(
                          child: SelectableText(
                            block.text,
                            style: TextStyle(
                              fontSize: 16,
                              height: 1.5,
                              color: Theme.of(context)
                                  .colorScheme
                                  .onPrimaryContainer,
                            ),
                          ),
                        ),
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
                            label: Text(
                              chatActionLabel(action),
                              softWrap: true,
                            ),
                            onPressed: actionsEnabled
                                ? () => onPrompt(action)
                                : null,
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
