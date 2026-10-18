import type { Citation } from "@/lib/retrieval/citations";
import type { RetrievedContext } from "@/lib/retrieval/context";
import type { GenerationContext } from "@/lib/retrieval/prompt-boundary";

export interface RetrievalHit {
  rank: number;
  score: number;
  semanticScore: number;
  lexicalScore: number;
  chunkId: string;
  documentId: string;
  pageNumber: number;
  citation: Citation;
}

export interface RetrievalOutcome {
  displayQuery: string;
  retrievalQuery: string;
  hits: RetrievalHit[];
  context: RetrievedContext;
  generation: GenerationContext;
}

export type RetrievalDiversity = "none" | "mmr";

export interface RetrievalOptions {
  topK?: number;
  semanticWeight?: number;
  lexicalWeight?: number;
  diversity?: RetrievalDiversity;
  mmrLambda?: number;
  contextCharacterBudget?: number;
}
