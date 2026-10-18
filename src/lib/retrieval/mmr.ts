import { DEFAULT_MMR_LAMBDA } from "@/config/retrieval";
import { cosineSimilarity } from "@/lib/embeddings/cosine";

export interface DiversityCandidate {
  id: string;
  vector: Float32Array;
  relevance: number;
}

/**
 * Maximal Marginal Relevance.
 * score(d) = λ * sim(d, query) - (1 - λ) * max sim(d, selected)
 * λ = 1 keeps pure relevance order. This is optional and off by default.
 */
export function maximalMarginalRelevance(
  candidates: readonly DiversityCandidate[],
  k: number,
  lambda = DEFAULT_MMR_LAMBDA,
): string[] {
  if (k <= 0 || candidates.length === 0) return [];
  const weight = Math.min(1, Math.max(0, lambda));
  const remaining = [...candidates];
  const selected: DiversityCandidate[] = [];
  const ordered: string[] = [];

  while (remaining.length > 0 && ordered.length < k) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      if (!candidate) continue;
      let redundancy = 0;
      for (const chosen of selected) {
        redundancy = Math.max(redundancy, cosineSimilarity(candidate.vector, chosen.vector));
      }
      const score = weight * candidate.relevance - (1 - weight) * redundancy;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    const picked = remaining.splice(bestIndex, 1)[0];
    if (!picked) break;
    selected.push(picked);
    ordered.push(picked.id);
  }

  return ordered;
}
