import type { ContentItem, TasteSignal } from "../domain/types.js";

export interface TasteEvidence { id: string; source: string; score: number; weight: number; explicit: boolean; at: string; }
export const signalStrength = { super_like: 1, like: .72, meh: 0, dislike: -1, watchlist: .35, watched: 0, explicit_preference: 1, search: .015, detail_open: .01 } as const;
export function evidenceWeight(source: string): number {
  return ({ super_like: 2, like: 1.3, dislike: 2, onboarding_favorite: 1.3, watchlist: .35, search: .015, detail_open: .01, watched: 0 } as Record<string, number>)[source] ?? 3;
}
export function aggregateEvidence(dimension: string, key: string, entries: TasteEvidence[], now = Date.now()): TasteSignal {
  const correction = entries.filter((e) => ["explicit_edit", "chat_explicit", "onboarding_explicit", "onboarding_text"].includes(e.source)).sort((a,b) => b.at.localeCompare(a.at))[0];
  const active = correction ? [correction] : entries;
  let sum = 0, mass = 0;
  for (const entry of active) {
    const ageDays = Math.max(0, now - Date.parse(entry.at)) / 86_400_000;
    const weight = entry.weight * (entry.explicit ? 1 : Math.pow(.5, ageDays / 60));
    sum += entry.score * weight; mass += weight;
  }
  return { dimension, key, score: mass ? sum / mass : 0, confidence: mass / (mass + 1), evidenceCount: Math.max(1, entries.length), source: correction?.source ?? entries.at(-1)?.source ?? "unknown", explicit: Boolean(correction || entries.some((e) => e.explicit)), sources: [...new Set(entries.map((e) => e.source))], lastEvidenceAt: entries.map((e) => e.at).sort().at(-1) ?? new Date(now).toISOString(), updatedAt: new Date(now).toISOString() };
}
export function titleDimensions(item: ContentItem): Array<{ dimension: string; key: string }> {
  return [
    ...item.genres.map((key) => ({ dimension: "genre", key })),
    ...item.keywords.slice(0, 8).map((key) => ({ dimension: "keyword", key })),
    ...item.moods.map((key) => ({ dimension: "mood", key })),
    ...item.cast.slice(0, 3).map((key) => ({ dimension: "actor", key })),
    ...(item.director ? [{ dimension: "director", key: item.director }] : []),
    ...(item.originalLanguage ? [{ dimension: "language", key: item.originalLanguage }] : []),
    ...(item.year ? [{ dimension: "decade", key: `${Math.floor(item.year / 10) * 10}s` }] : []),
    { dimension: "format", key: item.mediaType },
    ...(item.countries ?? []).map((key) => ({ dimension: "country", key })),
    ...(item.collection ? [{ dimension: "franchise", key: item.collection }] : []),
  ].map((d) => ({ ...d, key: d.key.toLowerCase().trim() }));
}
