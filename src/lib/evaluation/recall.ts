export interface RetrievalCase {
  id: string;
  query: string;
  relevantChunkIds: readonly string[];
  topK: number;
}

export interface RetrievalCaseResult {
  id: string;
  recall: number;
  retrieved: string[];
}

export interface RetrievalEvaluation {
  recallAtK: number;
  cases: RetrievalCaseResult[];
  failures: string[];
}

export function recallAtK(relevantIds: readonly string[], retrievedIds: readonly string[], k: number): number {
  if (relevantIds.length === 0 || k <= 0) return 0;
  const retrieved = new Set(retrievedIds.slice(0, k));
  let found = 0;
  for (const id of new Set(relevantIds)) {
    if (retrieved.has(id)) found += 1;
  }
  return found / new Set(relevantIds).size;
}

/**
 * Developer evaluation helper. It does not run in the product UI and does not invent scores.
 */
export function evaluateRetrieval(
  cases: readonly RetrievalCase[],
  retrieve: (query: string, topK: number) => readonly string[],
): RetrievalEvaluation {
  const results = cases.map((testCase) => {
    const retrieved = [...retrieve(testCase.query, testCase.topK)];
    const recall = recallAtK(testCase.relevantChunkIds, retrieved, testCase.topK);
    return { id: testCase.id, recall, retrieved };
  });

  const recallAtKMean =
    results.length === 0 ? 0 : results.reduce((sum, result) => sum + result.recall, 0) / results.length;

  return {
    recallAtK: recallAtKMean,
    cases: results,
    failures: results.filter((result) => result.recall < 1).map((result) => result.id),
  };
}
