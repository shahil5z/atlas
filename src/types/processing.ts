/**
 * Document preparation state machine.
 * UI stages map onto these phases; there is no separate boolean loading flag.
 */
export type DocumentPhase =
  | "idle"
  | "validating"
  | "reading"
  | "extracting"
  | "identifying_pages"
  | "chunking"
  | "ready"
  | "error";

export type ActiveDocumentPhase = Exclude<DocumentPhase, "idle" | "ready" | "error">;

/** Document preparation plus the local retrieval stages that follow it. */
export type ResearchPhase =
  | ActiveDocumentPhase
  | "loading_model"
  | "embedding_document"
  | "indexing"
  | "embedding_query"
  | "retrieving";

export interface PreparationDetail {
  pageCount?: number;
  chunkCount?: number;
  embeddedChunks?: number;
  modelProgress?: number;
  modelFile?: string;
}
