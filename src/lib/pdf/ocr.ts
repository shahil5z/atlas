import type { DocumentPage } from "@/types/documents";

/**
 * Future OCR boundary. Phase 1 always returns null.
 * An adapter must return page text as data and must not execute it.
 */
export interface OcrAdapter {
  readonly id: string;
  extractPages(data: Uint8Array): Promise<DocumentPage[]>;
}

export function getOcrAdapter(): OcrAdapter | null {
  return null;
}
