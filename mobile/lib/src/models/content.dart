enum MediaType { movie, series }

class Availability {
  const Availability({
    required this.providerId,
    required this.providerName,
    required this.access,
    required this.owned,
    this.logoUrl,
  });
  final int providerId;
  final String providerName;
  final String access;
  final bool owned;
  final String? logoUrl;

  factory Availability.fromJson(Map<String, dynamic> json) => Availability(
    providerId: json['providerId'] as int? ?? 0,
    providerName: json['providerName'] as String? ?? 'Unknown provider',
    access: json['access'] as String? ?? 'subscription_required',
    owned: json['owned'] as bool? ?? false,
    logoUrl: json['logoUrl'] as String?,
  );
}

class ContentItem {
  const ContentItem({
    required this.id,
    required this.mediaType,
    required this.title,
    required this.overview,
    required this.genres,
    required this.moods,
    required this.availability,
    this.originalTitle,
    this.year,
    this.runtimeMinutes,
    this.rating,
    this.posterUrl,
    this.backdropUrl,
    this.director,
    this.cast = const [],
    this.metadataOnly = false,
  });
  final int id;
  final MediaType mediaType;
  final String title;
  final String? originalTitle;
  final String overview;
  final int? year;
  final int? runtimeMinutes;
  final double? rating;
  final String? posterUrl;
  final String? backdropUrl;
  final List<String> genres;
  final List<String> moods;
  final List<Availability> availability;
  final String? director;
  final List<String> cast;
  final bool metadataOnly;

  String get key => '${mediaType.name}:$id';
  String get metadata => [
    if (year != null) '$year',
    if (runtimeMinutes != null) '${runtimeMinutes}m',
    if (rating != null) '${rating!.toStringAsFixed(1)}/10',
  ].join('  ·  ');
  Availability? get bestAvailability =>
      availability
          .where((entry) => entry.owned && entry.access == 'included')
          .firstOrNull ??
      availability.firstOrNull;

  factory ContentItem.fromJson(Map<String, dynamic> json) => ContentItem(
    id: json['id'] as int,
    metadataOnly: json['metadataOnly'] as bool? ?? false,
    mediaType: json['mediaType'] == 'series'
        ? MediaType.series
        : MediaType.movie,
    title: json['title'] as String,
    originalTitle: json['originalTitle'] as String?,
    overview: json['overview'] as String? ?? '',
    year: json['year'] as int?,
    runtimeMinutes: json['runtimeMinutes'] as int?,
    rating: (json['rating'] as num?)?.toDouble(),
    posterUrl: json['posterUrl'] as String?,
    backdropUrl: json['backdropUrl'] as String?,
    director: json['director'] as String?,
    genres: (json['genres'] as List? ?? []).cast<String>(),
    moods: (json['moods'] as List? ?? []).cast<String>(),
    cast: (json['cast'] as List? ?? []).cast<String>(),
    availability: (json['availability'] as List? ?? [])
        .map(
          (value) =>
              Availability.fromJson((value as Map).cast<String, dynamic>()),
        )
        .toList(),
  );
}

class ContentRow {
  const ContentRow(this.title, this.subtitle, this.items);
  final String title;
  final String? subtitle;
  final List<ContentItem> items;
}
