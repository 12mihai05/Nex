import type { ContentItem, MediaType } from "../../domain/types.js";
import { normalizeEpgTitle, type NormalizedProgram } from "./xmltv.js";

export interface MatchResult {
  mediaType: MediaType;
  tmdbId: number;
  confidence: number;
  evidence: string[];
}

function tokens(value: string): Set<string> {
  return new Set(normalizeEpgTitle(value).split(" ").filter((token) => token.length > 1));
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  const shared = [...a].filter((token) => b.has(token)).length;
  return shared / Math.max(a.size, b.size);
}

export function scoreEpgCandidate(program: NormalizedProgram, candidate: ContentItem): MatchResult | null {
  const evidence: string[] = [];
  const normalizedProgram = normalizeEpgTitle(program.title);
  const normalizedCandidate = normalizeEpgTitle(candidate.title);
  const normalizedOriginal = candidate.originalTitle ? normalizeEpgTitle(candidate.originalTitle) : "";
  let score = 0;
  if (normalizedProgram === normalizedCandidate || normalizedProgram === normalizedOriginal) {
    score += 0.7; evidence.push("exact normalized title");
  } else {
    const titleOverlap = Math.max(overlap(tokens(program.title), tokens(candidate.title)), overlap(tokens(program.title), tokens(candidate.originalTitle ?? "")));
    score += titleOverlap * 0.55;
    if (titleOverlap >= 0.7) evidence.push("strong title overlap");
  }
  if (program.year && candidate.year) {
    if (program.year === candidate.year) { score += 0.15; evidence.push("year match"); }
    else if (Math.abs(program.year - candidate.year) > 1) score -= 0.2;
  }
  if (program.description && candidate.overview) {
    const descriptionOverlap = overlap(tokens(program.description), tokens(candidate.overview));
    score += descriptionOverlap * 0.15;
    if (descriptionOverlap >= 0.25) evidence.push("description overlap");
  }
  const category = program.category?.toLowerCase() ?? "";
  if (/movie|film/.test(category) && candidate.mediaType === "movie") { score += 0.08; evidence.push("movie category"); }
  if (/series|serial/.test(category) && candidate.mediaType === "series") { score += 0.08; evidence.push("series category"); }
  const confidence = Math.max(0, Math.min(1, score));
  return confidence >= 0.72 ? { mediaType: candidate.mediaType, tmdbId: candidate.id, confidence, evidence } : null;
}

export function bestEpgMatch(program: NormalizedProgram, candidates: ContentItem[]): MatchResult | null {
  const ranked = candidates.map((candidate) => scoreEpgCandidate(program, candidate)).filter((result): result is MatchResult => result !== null).sort((a,b)=>b.confidence-a.confidence);
  if (ranked[1] && ranked[0]!.confidence - ranked[1].confidence < .08) return null;
  return ranked[0] ?? null;
}
