import {
  CANDIDATE_POOL_FACTOR,
  DEFAULT_CONTEXT_CHAR_BUDGET,
  DEFAULT_MMR_LAMBDA,
  DEFAULT_TOP_K,
  LEXICAL_WEIGHT,
  SEMANTIC_WEIGHT,
} from "@/config/retrieval";
import { FULL_SCAN_CHUNK_LIMIT } from "@/config/embedding";
import type { DocumentChunk } from "@/types/documents";
import type { VectorRecord } from "@/lib/embeddings/vector-index";
import { MemoryVectorIndex } from "@/lib/embeddings/vector-index";
import { atlasError } from "@/lib/errors/atlas-error";
import { bm25Scores, normalizeScores } from "@/lib/retrieval/lexical";
import { maximalMarginalRelevance } from "@/lib/retrieval/mmr";
import { buildRetrievalContext } from "@/lib/retrieval/context";
import { processQuery } from "@/lib/retrieval/query";
import { buildGenerationContext } from "@/lib/retrieval/prompt-boundary";
import { defaultReranker, type Reranker } from "@/lib/retrieval/rerank";
import type { RetrievalOptions, RetrievalOutcome } from "@/lib/retrieval/types";

export function buildVectorRecords(
  chunks: readonly DocumentChunk[],
  vectors: readonly Float32Array[],
): VectorRecord[] {
  if (chunks.length !== vectors.length) throw atlasError("embedding_failed");
  return chunks.map((chunk, index) => {
    const embedding = vectors[index];
    if (!embedding) throw atlasError("embedding_failed");
    return {
      id: chunk.chunkId,
      chunkId: chunk.chunkId,
      documentId: chunk.documentId,
      pageNumber: chunk.pageNumber,
      embedding,
    };
  });
}

export function retrieveEvidence(input: {
  query: string;
  documentName: string;
  chunks: readonly DocumentChunk[];
  index: MemoryVectorIndex;
  queryVector: Float32Array;
  options?: RetrievalOptions;
  reranker?: Reranker;
}): RetrievalOutcome {
  const { displayQuery, retrievalQuery } = processQuery(input.query);
  if (retrievalQuery.length === 0) throw atlasError("invalid_query");
  if (input.chunks.length === 0 || input.index.size() === 0) throw atlasError("empty_document");

  const topK = input.options?.topK ?? DEFAULT_TOP_K;
  const semanticWeight = input.options?.semanticWeight ?? SEMANTIC_WEIGHT;
  const lexicalWeight = input.options?.lexicalWeight ?? LEXICAL_WEIGHT;
  const pool =
    input.index.size() <= FULL_SCAN_CHUNK_LIMIT
      ? input.index.size()
      : Math.min(input.index.size(), Math.max(topK, topK * CANDIDATE_POOL_FACTOR));

  const semanticHits = input.index.search(input.queryVector, { topK: pool });
  const lexical = normalizeScores(
    bm25Scores(
      retrievalQuery,
      input.chunks.map((chunk) => ({ id: chunk.chunkId, text: chunk.text })),
    ),
  );

  const combined = semanticHits.map((hit) => {
    const lexicalScore = lexical.get(hit.chunkId) ?? 0;
    return {
      chunkId: hit.chunkId,
      documentId: hit.documentId,
      pageNumber: hit.pageNumber,
      embedding: hit.embedding,
      semanticScore: hit.score,
      lexicalScore,
      score: semanticWeight * hit.score + lexicalWeight * lexicalScore,
    };
  });

  const reranker = input.reranker ?? defaultReranker;
  const orderedIds = reranker.rerank(retrievalQuery, combined).map((item) => item.chunkId);
  const byId = new Map(combined.map((candidate) => [candidate.chunkId, candidate]));
  let ranked = orderedIds.flatMap((chunkId) => {
    const candidate = byId.get(chunkId);
    return candidate ? [candidate] : [];
  });

  if (input.options?.diversity === "mmr") {
    const mmrIds = maximalMarginalRelevance(
      ranked.map((candidate) => ({
        id: candidate.chunkId,
        vector: candidate.embedding,
        relevance: candidate.score,
      })),
      topK,
      input.options.mmrLambda ?? DEFAULT_MMR_LAMBDA,
    );
    ranked = mmrIds.flatMap((chunkId) => {
      const candidate = byId.get(chunkId);
      return candidate ? [candidate] : [];
    });
  }

  const chunksById = new Map(input.chunks.map((chunk) => [chunk.chunkId, chunk]));
  const seen = new Set<string>();
  const unique: typeof ranked = [];
  for (const candidate of ranked) {
    const chunk = chunksById.get(candidate.chunkId);
    if (!chunk) continue;
    const excerpt = chunk.text.trim();
    if (excerpt.length === 0 || seen.has(candidate.chunkId) || seen.has(excerpt)) continue;
    seen.add(candidate.chunkId);
    seen.add(excerpt);
    unique.push(candidate);
  }

  const limited = unique.slice(0, topK);
  const context = buildRetrievalContext(
    limited.flatMap((candidate) => {
      const chunk = chunksById.get(candidate.chunkId);
      return chunk ? [{ chunk, score: candidate.score, documentName: input.documentName }] : [];
    }),
    input.options?.contextCharacterBudget ?? DEFAULT_CONTEXT_CHAR_BUDGET,
  );
  const citationByChunk = new Map(context.sources.map((source) => [source.chunkId, source.citation]));

  const text = context.text;
  return {
    displayQuery,
    retrievalQuery,
    hits: limited.flatMap((candidate, index) => {
      const citation = citationByChunk.get(candidate.chunkId) ?? {
        id: index + 1,
        label: `[${index + 1}]`,
        documentId: candidate.documentId,
        documentName: input.documentName,
        pageNumber: candidate.pageNumber,
        chunkId: candidate.chunkId,
      };
      return [
        {
          rank: index + 1,
          score: candidate.score,
          semanticScore: candidate.semanticScore,
          lexicalScore: candidate.lexicalScore,
          chunkId: candidate.chunkId,
          documentId: candidate.documentId,
          pageNumber: candidate.pageNumber,
          citation,
        },
      ];
    }),
    context,
    generation: buildGenerationContext(displayQuery, text),
  };
}
