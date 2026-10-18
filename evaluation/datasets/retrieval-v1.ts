import type { DocumentChunk } from "@/types/documents";

export const RETRIEVAL_DATASET_VERSION = "retrieval-v1";

export interface RetrievalFixtureCase {
  id: string;
  query: string;
  queryVector: number[];
  relevantChunkIds: string[];
}

export interface RetrievalFixture {
  version: string;
  documentName: string;
  chunks: DocumentChunk[];
  vectors: number[][];
  cases: RetrievalFixtureCase[];
}

function chunk(id: string, page: number, text: string): DocumentChunk {
  return {
    chunkId: id,
    documentId: "notes",
    pageNumber: page,
    text,
    characterStart: 0,
    characterEnd: text.length,
  };
}

/**
 * Synthetic notes. Vectors are hand-built so cosine order is deterministic.
 * This is not a user document and it is not copyrighted source text.
 */
export const RETRIEVAL_V1: RetrievalFixture = {
  version: RETRIEVAL_DATASET_VERSION,
  documentName: "Atlas notes",
  chunks: [
    chunk("sem-a", 2, "Atlas uses cosine similarity for semantic search over local embeddings."),
    chunk("sem-b", 3, "Local embeddings support semantic search in the browser index."),
    chunk("lex", 4, "The Tuesday budget meeting approved the research grant."),
    chunk("noise-a", 1, "Page numbers stay with each extracted passage."),
    chunk("noise-b", 5, "The footer contains the document title and date."),
    chunk("noise-c", 6, "Figures are numbered in the appendix."),
  ],
  vectors: [
    [1, 0, 0],
    [0.8, 0.2, 0],
    [0, 0, 1],
    [0, 1, 0],
    [0.1, 0.9, 0],
    [0.2, 0.2, 0.2],
  ],
  cases: [
    {
      id: "semantic-search",
      query: "What mechanism does the system use for semantic search?",
      queryVector: [1, 0, 0],
      relevantChunkIds: ["sem-a", "sem-b"],
    },
    {
      id: "tuesday-budget",
      query: "Tuesday budget",
      queryVector: [0, 0.15, 0.15],
      relevantChunkIds: ["lex"],
    },
  ],
};
