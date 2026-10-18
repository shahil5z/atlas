export interface DocumentPage {
  pageNumber: number;
  text: string;
}

export interface DocumentMetadata {
  id: string;
  name: string;
  size: number;
  pageCount: number;
  createdAt: number;
}

/**
 * Session-scoped document. `id` exists only in memory and is never stored.
 * Page text is untrusted data, not application instructions.
 */
export interface ParsedDocument extends DocumentMetadata {
  pages: DocumentPage[];
}

export interface DocumentChunk {
  chunkId: string;
  documentId: string;
  pageNumber: number;
  text: string;
  characterStart: number;
  characterEnd: number;
  /** Nearest heading on the same page, when one is detectable. Session memory only. */
  heading?: string;
  /** Major section the chunk belongs to (e.g. "Day 8", "3 Results"); may carry over from an earlier page. */
  section?: string;
  /** Zero-based order of the chunk in the whole document. */
  chunkIndex?: number;
  /** Estimated document type, attached after profiling. Session memory only. */
  documentType?: string;
}

export type ExtractionQuality = "text" | "partial" | "sparse" | "no_extractable_text";

export interface ExtractionAssessment {
  pageCount: number;
  extractableCharacterCount: number;
  nonEmptyPageCount: number;
  emptyPageCount: number;
  quality: ExtractionQuality;
}

export interface SelectedDocument {
  name: string;
  size: number;
  file: File;
}
