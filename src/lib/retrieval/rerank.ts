export interface ScoredCandidate {
  chunkId: string;
  score: number;
}

/**
 * Orders candidates by an existing score.
 * This is not a neural reranker. A later phase can replace it with a cross-encoder.
 */
export interface Reranker {
  readonly id: string;
  rerank(query: string, candidates: readonly ScoredCandidate[]): ScoredCandidate[];
}

export class SimilarityOrderReranker implements Reranker {
  readonly id = "similarity-order";

  rerank(_query: string, candidates: readonly ScoredCandidate[]): ScoredCandidate[] {
    return [...candidates].sort(
      (left, right) => right.score - left.score || left.chunkId.localeCompare(right.chunkId),
    );
  }
}

export const defaultReranker = new SimilarityOrderReranker();
