import { MAX_EXTRACTED_CHARACTERS, MAX_PDF_PAGES } from "@/config/documents";
import { assemblePageText, type PageTextFragment } from "@/lib/pdf/assemble-page-text";
import { loadPdfjs } from "@/lib/pdf/load-pdfjs";
import { atlasError } from "@/lib/errors/atlas-error";
import type { ActiveDocumentPhase } from "@/types/processing";
import type { ParsedDocument } from "@/types/documents";
import type { DocumentProcessingResponse } from "@/workers/document-processing";

export interface ParsePdfHooks {
  onPhase?: (phase: Extract<ActiveDocumentPhase, "reading" | "extracting">) => void;
  signal?: AbortSignal;
}

interface TextItemLike {
  str: string;
  hasEOL: boolean;
}

function isTextItem(item: unknown): item is TextItemLike {
  if (typeof item !== "object" || item === null) return false;
  if (!("str" in item) || !("hasEOL" in item)) return false;
  return typeof item.str === "string" && typeof item.hasEOL === "boolean";
}

/**
 * Reads a PDF already resident in browser memory.
 * JavaScript actions inside the PDF are never executed.
 * WASM image decoding is disabled so PDF.js does not fetch extra assets.
 */
export async function extractDocument(
  data: Uint8Array,
  hooks?: ParsePdfHooks,
): Promise<DocumentProcessingResponse> {
  hooks?.onPhase?.("reading");

  if (hooks?.signal?.aborted) throw atlasError("unexpected");

  const pdfjs = await loadPdfjs();
  const loadingTask = pdfjs.getDocument({
    data,
    enableXfa: false,
    disableFontFace: true,
    disableRange: true,
    disableStream: true,
    disableAutoFetch: true,
    useWasm: false,
    verbosity: 0,
  });

  if (hooks?.signal) {
    hooks.signal.addEventListener("abort", () => {
      void loadingTask.destroy().catch(() => undefined);
    }, { once: true });
  }

  try {
    const pdf = await loadingTask.promise;
    if (hooks?.signal?.aborted) throw atlasError("unexpected");
    if (pdf.numPages > MAX_PDF_PAGES) throw atlasError("too_many_chunks");
    hooks?.onPhase?.("extracting");
    const pages = [];
    let characters = 0;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      if (hooks?.signal?.aborted) throw atlasError("unexpected");
      const page = await pdf.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        const fragments: PageTextFragment[] = [];
        for (const item of content.items) {
          if (isTextItem(item)) {
            fragments.push({ str: item.str, hasEOL: item.hasEOL });
          }
        }
        const text = assemblePageText(fragments);
        characters += text.length;
        if (characters > MAX_EXTRACTED_CHARACTERS) throw atlasError("too_many_chunks");
        pages.push({ pageNumber, text });
      } finally {
        page.cleanup();
      }
    }

    return { pageCount: pdf.numPages, pages };
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}

export async function parsePdf(file: File, hooks?: ParsePdfHooks): Promise<ParsedDocument> {
  if (typeof window === "undefined") {
    throw atlasError("unexpected");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const extracted = await extractDocument(bytes, hooks);

  return {
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    pageCount: extracted.pageCount,
    pages: extracted.pages,
    createdAt: Date.now(),
  };
}
