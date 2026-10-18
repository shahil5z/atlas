import { MAX_INDEX_CHUNKS } from "@/config/chunking";
import { MAX_EXTRACTED_CHARACTERS, MAX_PDF_PAGES } from "@/config/documents";
import { assessExtraction } from "@/lib/pdf/document-stats";
import { chunkDocument } from "@/lib/chunking/chunk-document";
import { validatePdfFile } from "@/lib/documents/validate-pdf-file";
import { atlasError } from "@/lib/errors/atlas-error";
import { toAtlasError } from "@/lib/errors/to-atlas-error";
import type { ExtractionAssessment, DocumentChunk, ParsedDocument } from "@/types/documents";
import type { AtlasError } from "@/types/errors";
import type { ActiveDocumentPhase } from "@/types/processing";

export interface PrepareDocumentOptions {
  onPhase?: (phase: ActiveDocumentPhase) => void;
  signal?: AbortSignal;
}

export type PrepareDocumentResult =
  | {
      ok: true;
      document: ParsedDocument;
      chunks: DocumentChunk[];
      extraction: ExtractionAssessment;
      timings: { parseMs: number; chunkMs: number };
    }
  | {
      ok: false;
      error: AtlasError;
      document: ParsedDocument | null;
      extraction: ExtractionAssessment | null;
    };

/**
 * Validates, extracts, and chunks a PDF entirely in the browser.
 * The File never leaves this function through fetch or form upload.
 * Image-only PDFs stop here. `getOcrAdapter` in `src/lib/pdf/ocr.ts` is the
 * extension point for a later OCR pass; Phase 1 does not call one.
 */
export async function prepareDocument(
  file: File,
  options?: PrepareDocumentOptions,
): Promise<PrepareDocumentResult> {
  try {
    options?.onPhase?.("validating");
    const validation = await validatePdfFile(file);
    if (!validation.ok) {
      return { ok: false, error: validation.error, document: null, extraction: null };
    }

    const { parsePdf } = await import("@/lib/pdf/parse-pdf");
    const parseStarted = performance.now();
    const document = await parsePdf(file, {
      onPhase: (phase) => options?.onPhase?.(phase),
      signal: options?.signal,
    });
    if (options?.signal?.aborted) {
      return { ok: false, error: atlasError("unexpected"), document: null, extraction: null };
    }
    const parseMs = performance.now() - parseStarted;

    if (document.pageCount === 0 || document.pages.length === 0) {
      return { ok: false, error: atlasError("empty_pdf"), document, extraction: null };
    }
    if (document.pageCount > MAX_PDF_PAGES) {
      return { ok: false, error: atlasError("too_many_chunks"), document, extraction: null };
    }

    options?.onPhase?.("identifying_pages");
    const extraction = assessExtraction(document);
    if (extraction.extractableCharacterCount > MAX_EXTRACTED_CHARACTERS) {
      return { ok: false, error: atlasError("too_many_chunks"), document, extraction };
    }

    if (extraction.quality === "no_extractable_text") {
      return { ok: false, error: atlasError("no_extractable_text"), document, extraction };
    }

    options?.onPhase?.("chunking");
    const chunkStarted = performance.now();
    const chunks = chunkDocument(document);
    const chunkMs = performance.now() - chunkStarted;
    if (chunks.length > MAX_INDEX_CHUNKS) {
      return { ok: false, error: atlasError("too_many_chunks"), document, extraction };
    }

    return { ok: true, document, chunks, extraction, timings: { parseMs, chunkMs } };
  } catch (error) {
    return {
      ok: false,
      error: toAtlasError(error, "prepare-document"),
      document: null,
      extraction: null,
    };
  }
}
