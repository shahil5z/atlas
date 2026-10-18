/**
 * Retrieval metrics.
 *
 * Recall@K = |relevant ∩ top K| / |relevant|
 * Precision@K = |relevant ∩ top K| / K
 * MRR = mean of 1 / rank of the first relevant item (0 when none)
 * nDCG@K = DCG@K / IDCG@K, with binary relevance and log2(rank + 1)
 */

export function precisionAtK(relevantIds: readonly string[], retrievedIds: readonly string[], k: number): number {
  if (k <= 0) return 0;
  const relevant = new Set(relevantIds);
  const hits = retrievedIds.slice(0, k).filter((id) => relevant.has(id)).length;
  return hits / k;
}

export function reciprocalRank(relevantIds: readonly string[], retrievedIds: readonly string[]): number {
  const relevant = new Set(relevantIds);
  const index = retrievedIds.findIndex((id) => relevant.has(id));
  return index < 0 ? 0 : 1 / (index + 1);
}

export function meanReciprocalRank(cases: readonly { relevantIds: readonly string[]; retrievedIds: readonly string[] }[]): number {
  if (cases.length === 0) return 0;
  return mean(cases.map((item) => reciprocalRank(item.relevantIds, item.retrievedIds)));
}

function dcg(gains: readonly number[]): number {
  return gains.reduce((sum, gain, index) => sum + gain / Math.log2(index + 2), 0);
}

export function ndcgAtK(relevantIds: readonly string[], retrievedIds: readonly string[], k: number): number {
  const relevant = new Set(relevantIds);
  if (relevant.size === 0 || k <= 0) return 0;
  const gains = retrievedIds.slice(0, k).map((id) => (relevant.has(id) ? 1 : 0));
  const ideal = Array.from({ length: Math.min(k, relevant.size) }, () => 1);
  const idealScore = dcg(ideal);
  if (idealScore === 0) return 0;
  return dcg(gains) / idealScore;
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
