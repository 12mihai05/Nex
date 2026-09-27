class TvProgram {
  const TvProgram({
    required this.id,
    required this.title,
    required this.channel,
    required this.startsAt,
    required this.endsAt,
    this.description,
    this.logoUrl,
    this.channelId = '',
    this.favorite = false,
  });
  final String id;
  final String title;
  final String channel;
  final DateTime startsAt;
  final DateTime endsAt;
  final String? description;
  final String? logoUrl;
  final String channelId;
  final bool favorite;
  factory TvProgram.fromJson(Map<String, dynamic> json) => TvProgram(
    id: json['id'] as String,
    title: json['title'] as String,
    channel: (json['channel'] as Map)['name'] as String,
    channelId: (json['channel'] as Map)['id'] as String? ?? '',
    startsAt: DateTime.parse(json['startAt'] as String).toLocal(),
    endsAt: DateTime.parse(json['endAt'] as String).toLocal(),
    description: json['description'] as String?,
    favorite: json['favorite'] == true,
  );
  bool get isLive {
    final now = DateTime.now();
    return startsAt.isBefore(now) && endsAt.isAfter(now);
  }
}
