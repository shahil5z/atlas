import type { DocumentPage } from "@/types/documents";

/**
 * Contract for moving PDF parsing onto a dedicated worker later.
 * Phase 1 fulfills the same result shape on PDF.js's own worker.
 * `data` is raw bytes already in the browser, never a remote URL.
 */
export interface DocumentProcessingRequest {
  data: Uint8Array;
  name: string;
}

export interface DocumentProcessingResponse {
  pageCount: number;
  pages: DocumentPage[];
}
