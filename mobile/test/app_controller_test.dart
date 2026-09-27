import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nex/src/state/app_controller.dart';
import 'package:nex/src/models/chat_message.dart';

void main() {
  test('seen and every opinion are independently editable', () async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final controller = container.read(appControllerProvider.notifier);
    final item = controller.catalog.first;
    for (final reaction in ['like', 'dislike', 'meh', 'super_like']) {
      await controller.react(item, reaction);
      expect(
        container.read(appControllerProvider).watched,
        isNot(contains(item.key)),
      );
      await controller.markWatched(item);
      expect(
        container.read(appControllerProvider).reactions[item.key],
        reaction,
      );
      await controller.removeWatched(item);
      expect(
        container.read(appControllerProvider).reactions[item.key],
        reaction,
      );
    }
    await controller.markWatched(item);
    await controller.react(item, null);
    expect(container.read(appControllerProvider).watched, contains(item.key));
    expect(
      container.read(appControllerProvider).reactions.containsKey(item.key),
      isFalse,
    );
  });
  test('demo Chat respects runtime and included service limits', () async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final controller = container.read(appControllerProvider.notifier);
    await controller.sendChat('Something under two hours');
    final items = container
        .read(appControllerProvider)
        .chatMessages
        .last
        .blocks
        .whereType<CarouselChatBlock>()
        .expand((b) => b.items);
    expect(items, isNotEmpty);
    expect(
      items.every((i) => i.runtimeMinutes != null && i.runtimeMinutes! <= 120),
      isTrue,
    );
    expect(
      items.every(
        (i) => i.availability.any(
          (a) =>
              a.access == 'included' &&
              container
                  .read(appControllerProvider)
                  .providers
                  .contains(a.providerId),
        ),
      ),
      isTrue,
    );
  });
  test('watchlist and watched history are independent signals', () async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final controller = container.read(appControllerProvider.notifier);
    final item = controller.catalog.first;
    await controller.toggleWatchlist(item);
    expect(container.read(appControllerProvider).watchlist, contains(item.key));
    expect(
      container.read(appControllerProvider).watched,
      isNot(contains(item.key)),
    );
    await controller.markWatched(item);
    expect(container.read(appControllerProvider).watched, contains(item.key));
    expect(controller.browseHero?.key, isNot(item.key));
  });

  test('another pick avoids rejected candidates in the session', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final controller = container.read(appControllerProvider.notifier);
    final first = controller.pickForMe();
    final next = controller.pickForMe(excluded: {first.id});
    expect(next.id, isNot(first.id));
  });
}
