import 'dart:convert';

class ChatDeliveryException implements Exception {
  const ChatDeliveryException(this.message);
  final String message;
}

/// Decodes SSE across arbitrary network chunks, including split UTF-8 text.
Stream<Map<String, dynamic>> decodeChatEvents(Stream<List<int>> bytes) async* {
  String event = 'message';
  final data = <String>[];
  await for (final line
      in utf8.decoder.bind(bytes).transform(const LineSplitter())) {
    if (line.isEmpty) {
      if (data.isNotEmpty) {
        yield {'event': event, 'data': jsonDecode(data.join('\n'))};
      }
      event = 'message';
      data.clear();
    } else if (line.startsWith('event:')) {
      event = line.substring(6).trim();
    } else if (line.startsWith('data:')) {
      data.add(line.substring(5).trimLeft());
    }
  }
}

String chatProgressLabel(String phase) => switch (phase) {
  'resolve_titles' ||
  'find_person' ||
  'title_details' => 'Checking the details',
  'read_profile' => 'Looking at your saved picks',
  'recommend' => 'Finding a good fit',
  'tv_guide' => 'Checking the TV guide',
  'release_calendar' || 'current_news' => 'Checking the latest information',
  'prepare_change' => 'Checking your requested changes',
  'explain_pick' => 'Checking why this was picked',
  'composing' => 'Putting the answer together',
  _ => 'Thinking',
};
