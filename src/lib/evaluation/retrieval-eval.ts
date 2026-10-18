import { EMBEDDING_DIMENSION, EMBEDDING_MODEL_ID } from "@/config/embedding";
import { RETRIEVAL_V1, type RetrievalFixture } from "../../../evaluation/datasets/retrieval-v1";
import { MemoryVectorIndex } from "@/lib/embeddings/vector-index";
import { recallAtK } from "@/lib/evaluation/recall";
import { mean, meanReciprocalRank, ndcgAtK, precisionAtK } from "@/lib/evaluation/formulas";
import type { EvaluationFailure } from "@/lib/evaluation/failures";
import { buildVectorRecords, retrieveEvidence } from "@/lib/retrieval/retrieve";
import type { RetrievalOptions } from "@/lib/retrieval/types";

export type RetrievalVariantId = "semantic" | "hybrid" | "hybrid-mmr";

export interface RetrievalVariantResult {
  id: RetrievalVariantId;
  embeddingModelId: string;
  configuredDimension: number;
  cases: number;
  recallAt1: number;
  recallAt3: number;
  recallAt5: number;
  precisionAt5: number;
  mrr: number;
  ndcgAt5: number;
  latencyMs: number;
}

const VARIANTS: Record<RetrievalVariantId, RetrievalOptions> = {
  semantic: { semanticWeight: 1, lexicalWeight: 0, diversity: "none" },
  hybrid: { semanticWeight: 0.8, lexicalWeight: 0.2, diversity: "none" },
  "hybrid-mmr": { semanticWeight: 0.8, lexicalWeight: 0.2, diversity: "mmr" },
};

function vectorsOf(fixture: RetrievalFixture): Float32Array[] {
  return fixture.vectors.map((values) => Float32Array.from(values));
}

export function rankFixture(
  fixture: RetrievalFixture,
  query: string,
  queryVector: number[],
  options: RetrievalOptions,
  topK = 5,
): string[] {
  const index = new MemoryVectorIndex();
  index.add(buildVectorRecords(fixture.chunks, vectorsOf(fixture)));
  const outcome = retrieveEvidence({
    query,
    documentName: fixture.documentName,
    chunks: fixture.chunks,
    index,
    queryVector: Float32Array.from(queryVector),
    options: { ...options, topK },
  });
  return outcome.hits.map((hit) => hit.chunkId);
}

export function evaluateRetrievalVariant(
  variant: RetrievalVariantId,
  fixture: RetrievalFixture = RETRIEVAL_V1,
): RetrievalVariantResult {
  const started = performance.now();
  const ranked = fixture.cases.map((testCase) => ({
    relevantIds: testCase.relevantChunkIds,
    retrievedIds: rankFixture(fixture, testCase.query, testCase.queryVector, VARIANTS[variant]),
  }));
  return {
    id: variant,
    embeddingModelId: EMBEDDING_MODEL_ID,
    configuredDimension: EMBEDDING_DIMENSION,
    cases: fixture.cases.length,
    recallAt1: mean(ranked.map((item) => recallAtK(item.relevantIds, item.retrievedIds, 1))),
    recallAt3: mean(ranked.map((item) => recallAtK(item.relevantIds, item.retrievedIds, 3))),
    recallAt5: mean(ranked.map((item) => recallAtK(item.relevantIds, item.retrievedIds, 5))),
    precisionAt5: mean(ranked.map((item) => precisionAtK(item.relevantIds, item.retrievedIds, 5))),
    mrr: meanReciprocalRank(ranked),
    ndcgAt5: mean(ranked.map((item) => ndcgAtK(item.relevantIds, item.retrievedIds, 5))),
    latencyMs: performance.now() - started,
  };
}

export function retrievalDelta(baseline: RetrievalVariantResult, candidate: RetrievalVariantResult): number {
  return candidate.recallAt5 - baseline.recallAt5;
}

export function retrievalFailures(result: RetrievalVariantResult, minimumRecallAt5: number): EvaluationFailure[] {
  if (result.recallAt5 + 1e-9 >= minimumRecallAt5) return [];
  return [
    {
      caseId: result.id,
      category: "retrieval",
      expected: `Recall@5 >= ${minimumRecallAt5}`,
      actual: String(result.recallAt5),
      severity: "high",
      metadata: { variant: result.id },
    },
  ];
}
