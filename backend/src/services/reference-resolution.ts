export interface DisplayedReference { position: number; externalId: string; contentType: string }

const ordinals: Record<string, number> = {
  first: 1, "1st": 1, second: 2, "2nd": 2, third: 3, "3rd": 3, fourth: 4, "4th": 4, fifth: 5, "5th": 5,
};

export function resolveDisplayedReference(message: string, items: DisplayedReference[]): DisplayedReference | null {
  const lower = message.toLowerCase();
  const numeric = lower.match(/\b(?:number|#)?\s*(\d+)\b/);
  const word = Object.entries(ordinals).find(([token]) => new RegExp(`\\b${token}\\b`).test(lower));
  const position = word?.[1] ?? (numeric ? Number(numeric[1]) : null);
  if (position !== null) return items.find((item) => item.position === position) ?? null;
  if (/\b(that|it|this one)\b/.test(lower) && items.length === 1) return items[0] ?? null;
  return null;
}
