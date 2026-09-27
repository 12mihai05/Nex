import type { ContentItem } from "../domain/types.js";

const image = (path: string) => `https://image.tmdb.org/t/p/w780${path}`;

export const fixtureCatalog: ContentItem[] = [
  {
    id: 329865, mediaType: "movie", title: "Arrival", originalTitle: "Arrival",
    overview: "A linguist is recruited to communicate with mysterious visitors whose arrival may reshape humanity's future.",
    year: 2016, runtimeMinutes: 116, rating: 7.6, popularity: 82,
    posterUrl: image("/x2FJsf1ElAgr63Y3PNPtJrcmpoe.jpg"), backdropUrl: image("/yIZ1xendyqKvY3FGeeUYUd5X9Mm.jpg"),
    genres: ["Science Fiction", "Drama", "Mystery"], genreIds: [878, 18, 9648], moods: ["cerebral", "emotional", "slow-burn"],
    keywords: ["first contact", "language", "time"], cast: ["Amy Adams", "Jeremy Renner"], director: "Denis Villeneuve", originalLanguage: "en",
    availability: [{ providerId: 1899, providerName: "Max", logoUrl: null, access: "included", owned: true }],
  },
  {
    id: 157336, mediaType: "movie", title: "Interstellar", originalTitle: "Interstellar",
    overview: "Explorers travel through a wormhole in search of a future for humanity while one family confronts the cost of time apart.",
    year: 2014, runtimeMinutes: 169, rating: 8.5, popularity: 95,
    posterUrl: image("/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg"), backdropUrl: image("/rAiYTfKGqDCRIIqo664sY9XZIvQ.jpg"),
    genres: ["Adventure", "Drama", "Science Fiction"], genreIds: [12, 18, 878], moods: ["cerebral", "emotional", "intense"],
    keywords: ["space", "time", "family"], cast: ["Matthew McConaughey", "Anne Hathaway"], director: "Christopher Nolan", originalLanguage: "en",
    availability: [{ providerId: 8, providerName: "Netflix", logoUrl: null, access: "included", owned: true }],
  },
  {
    id: 545611, mediaType: "movie", title: "Everything Everywhere All at Once", originalTitle: "Everything Everywhere All at Once",
    overview: "A weary laundromat owner is swept into a playful multiverse crisis and must reconnect with what matters most.",
    year: 2022, runtimeMinutes: 140, rating: 7.7, popularity: 76,
    posterUrl: image("/w3LxiVYdWWRvEVdn5RYq6jIqkb1.jpg"), backdropUrl: image("/ss0Os3uWJfQAENILHZUdX8Tt1OC.jpg"),
    genres: ["Action", "Adventure", "Science Fiction"], genreIds: [28, 12, 878], moods: ["weird", "funny", "emotional", "fast-paced"],
    keywords: ["multiverse", "family", "absurdism"], cast: ["Michelle Yeoh", "Ke Huy Quan"], director: "Daniel Kwan, Daniel Scheinert", originalLanguage: "en",
    availability: [{ providerId: 337, providerName: "Disney+", logoUrl: null, access: "included", owned: false }],
  },
  {
    id: 496243, mediaType: "movie", title: "Parasite", originalTitle: "기생충",
    overview: "A struggling family gradually enters the lives of a wealthy household, with consequences none of them anticipate.",
    year: 2019, runtimeMinutes: 133, rating: 8.5, popularity: 89,
    posterUrl: image("/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg"), backdropUrl: image("/TU9NIjwzjoKPwQHoHshkFcQUCG.jpg"),
    genres: ["Comedy", "Thriller", "Drama"], genreIds: [35, 53, 18], moods: ["dark", "tense", "weird"],
    keywords: ["class", "family", "social satire"], cast: ["Song Kang-ho", "Cho Yeo-jeong"], director: "Bong Joon Ho", originalLanguage: "ko",
    availability: [{ providerId: 119, providerName: "Prime Video", logoUrl: null, access: "rent", owned: true }],
  },
  {
    id: 508442, mediaType: "movie", title: "Soul", originalTitle: "Soul",
    overview: "A music teacher on the verge of his big break takes an unexpected journey through the place where personalities begin.",
    year: 2020, runtimeMinutes: 101, rating: 8.1, popularity: 70,
    posterUrl: image("/hm58Jw4Lw8OIeECIq5qyPYhAeRJ.jpg"), backdropUrl: image("/kf456ZqeC45XTvo6W9pW5clYKfQ.jpg"),
    genres: ["Animation", "Family", "Comedy"], genreIds: [16, 10751, 35], moods: ["feel-good", "funny", "emotional"],
    keywords: ["music", "purpose", "life"], cast: ["Jamie Foxx", "Tina Fey"], director: "Pete Docter", originalLanguage: "en",
    availability: [{ providerId: 337, providerName: "Disney+", logoUrl: null, access: "included", owned: false }],
  },
  {
    id: 466272, mediaType: "movie", title: "Once Upon a Time… in Hollywood", originalTitle: "Once Upon a Time... in Hollywood",
    overview: "A fading actor and his stunt double navigate a changing Hollywood in the summer of 1969.",
    year: 2019, runtimeMinutes: 162, rating: 7.4, popularity: 68,
    posterUrl: image("/8j58iEBw9pOXFD2L0nt0ZXeHviB.jpg"), backdropUrl: image("/yB2hTgz9CTVYjlMWPSl3LPx5nWj.jpg"),
    genres: ["Comedy", "Drama", "Thriller"], genreIds: [35, 18, 53], moods: ["funny", "slow-burn", "tense"],
    keywords: ["hollywood", "friendship", "1960s"], cast: ["Leonardo DiCaprio", "Brad Pitt"], director: "Quentin Tarantino", originalLanguage: "en",
    availability: [{ providerId: 8, providerName: "Netflix", logoUrl: null, access: "included", owned: true }],
  },
  {
    id: 1396, mediaType: "series", title: "Breaking Bad", originalTitle: "Breaking Bad",
    overview: "A chemistry teacher makes a desperate choice that pulls him into a dangerous criminal world.",
    year: 2008, runtimeMinutes: 48, rating: 8.9, popularity: 99,
    posterUrl: image("/3xnWaLQjelJDDF7LT1WBo6f4BRe.jpg"), backdropUrl: image("/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg"),
    genres: ["Drama", "Crime"], genreIds: [18, 80], moods: ["dark", "tense", "intense"],
    keywords: ["crime", "moral decline"], cast: ["Bryan Cranston", "Aaron Paul"], director: null, originalLanguage: "en",
    availability: [{ providerId: 8, providerName: "Netflix", logoUrl: null, access: "included", owned: true }],
  },
  {
    id: 87108, mediaType: "series", title: "Chernobyl", originalTitle: "Chernobyl",
    overview: "Scientists and officials confront the human and political cost of a catastrophic nuclear accident.",
    year: 2019, runtimeMinutes: 65, rating: 8.7, popularity: 88,
    posterUrl: image("/hlLXt2tOPT6RRnjiUmoxyG1LTFi.jpg"), backdropUrl: image("/900tHlUYUkp7Ol04XFSoAaEIXcT.jpg"),
    genres: ["Drama"], genreIds: [18], moods: ["dark", "tense", "cerebral"],
    keywords: ["history", "disaster", "politics"], cast: ["Jared Harris", "Stellan Skarsgård"], director: null, originalLanguage: "en",
    availability: [{ providerId: 1899, providerName: "Max", logoUrl: null, access: "included", owned: true }],
  },
];

export const fixtureProviders = [
  { id: 8, name: "Netflix", logoUrl: "https://image.tmdb.org/t/p/w92/t2yyOv40HZeVlLjYsCsPHnWLk4W.jpg" },
  { id: 1899, name: "Max", logoUrl: "https://image.tmdb.org/t/p/w92/jbe4gVSfRlbPTdESXhEKpornsfu.jpg" },
  { id: 337, name: "Disney+", logoUrl: "https://image.tmdb.org/t/p/w92/97yvRBw1GzX7fXprcF80er19ot.jpg" },
  { id: 119, name: "Prime Video", logoUrl: "https://image.tmdb.org/t/p/w92/pvske1MyAoymrs5bguRfVqYiM9a.jpg" },
  { id: 1773, name: "SkyShowtime", logoUrl: null },
];
