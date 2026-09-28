import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app_controller.dart';

final channelOverridesProvider =
    NotifierProvider<ChannelOverrides, Map<String, bool>>(ChannelOverrides.new);

class ChannelOverrides extends Notifier<Map<String, bool>> {
  @override
  Map<String, bool> build() {
    ref.watch(
      appControllerProvider.select(
        (s) => (s.country, s.authenticated, s.demoMode),
      ),
    );
    return {};
  }

  void set(String id, bool value) => state = {...state, id: value};
}
