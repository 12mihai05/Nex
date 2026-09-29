String tasteLabel(Map<String, dynamic> entry) {
  final key = entry['key'] as String;
  if (entry['dimension'] == 'language') {
    const languages = {
      'ko': 'Korean',
      'en': 'English',
      'ro': 'Romanian',
      'ja': 'Japanese',
      'fr': 'French',
      'de': 'German',
      'es': 'Spanish',
      'it': 'Italian',
      'zh': 'Chinese',
      'hi': 'Hindi',
      'tr': 'Turkish',
      'ru': 'Russian',
    };
    return '${languages[key] ?? key.toUpperCase()}-language titles';
  }
  if (entry['dimension'] == 'country') {
    const countries = {
      'kr': 'South Korea',
      'ro': 'Romania',
      'us': 'United States',
      'gb': 'United Kingdom',
      'fr': 'France',
      'de': 'Germany',
      'es': 'Spain',
      'it': 'Italy',
      'jp': 'Japan',
      'cn': 'China',
    };
    return 'Titles from ${countries[key.toLowerCase()] ?? key.toUpperCase()}';
  }
  if (['kpop', 'k-pop', 'k pop'].contains(key)) return 'K-pop';
  if (['kdrama', 'k-drama', 'k drama'].contains(key)) return 'K-drama';
  return key;
}
