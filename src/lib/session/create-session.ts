import type { AgentEvent, ResearchAnswer, ResearchRunMetrics } from "@/lib/agents/types";
import type { ExtractionAssessment, DocumentChunk, ParsedDocument } from "@/types/documents";
import { emptyMetrics } from "@/lib/retrieval/metrics";
import type { PipelineMetrics } from "@/lib/retrieval/metrics";
import type { RetrievalOutcome } from "@/lib/retrieval/types";
import type { EmbeddingDescriptor, ResearchSession } from "@/types/session";

export interface CreateSessionInput {
  sessionId: string;
  messageId: string;
  query: string;
  document: ParsedDocument | null;
  chunks: DocumentChunk[];
  extraction: ExtractionAssessment | null;
  createdAt: number;
  retrieval?: RetrievalOutcome | null;
  metrics?: PipelineMetrics;
  embedding?: EmbeddingDescriptor | null;
  sourceFile?: File | null;
  answer?: ResearchAnswer | null;
  trace?: AgentEvent[];
  runMetrics?: ResearchRunMetrics | null;
}

export function createResearchSession(input: CreateSessionInput): ResearchSession {
  const query = input.query.trim();

  return {
    sessionId: input.sessionId,
    query,
    document: input.document,
    chunks: input.chunks,
    messages: [
      {
        id: input.messageId,
        role: "user",
        content: query,
        createdAt: input.createdAt,
      },
    ],
    extraction: input.extraction,
    retrieval: input.retrieval ?? null,
    metrics: input.metrics ?? emptyMetrics(),
    embedding: input.embedding ?? null,
    sourceFile: input.sourceFile ?? null,
    answer: input.answer ?? null,
    trace: input.trace ?? [],
    runMetrics: input.runMetrics ?? null,
    createdAt: input.createdAt,
  };
}
