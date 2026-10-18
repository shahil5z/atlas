import type { AgentEvent, ResearchAnswer, ResearchRunMetrics } from "@/lib/agents/types";
import type { ExtractionAssessment, DocumentChunk, ParsedDocument } from "@/types/documents";
import type { PipelineMetrics } from "@/lib/retrieval/metrics";
import type { RetrievalOutcome } from "@/lib/retrieval/types";
import type { EmbeddingDevice } from "@/lib/embeddings/engine";

/**
 * A research turn. Assistant messages are reserved for a later local generator.
 */
export interface ResearchMessage {
  id: string;
  role: "user";
  content: string;
  createdAt: number;
}

export interface EmbeddingDescriptor {
  modelId: string;
  dimension: number;
  device: EmbeddingDevice;
}

/**
 * In-memory research session. Nothing in this object is written to disk,
 * storage APIs, or a server. Embedding vectors live in the memory index,
 * not in this object.
 */
export interface ResearchSession {
  sessionId: string;
  query: string;
  document: ParsedDocument | null;
  chunks: DocumentChunk[];
  messages: ResearchMessage[];
  extraction: ExtractionAssessment | null;
  retrieval: RetrievalOutcome | null;
  metrics: PipelineMetrics;
  embedding: EmbeddingDescriptor | null;
  sourceFile: File | null;
  answer: ResearchAnswer | null;
  trace: AgentEvent[];
  runMetrics: ResearchRunMetrics | null;
  createdAt: number;
}
