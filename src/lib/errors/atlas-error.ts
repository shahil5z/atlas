import { MAX_QUERY_LENGTH } from "@/config/app";
import { MAX_PDF_SIZE_LABEL } from "@/config/documents";
import { ATLAS_ERROR_CODES, AtlasError, type AtlasErrorCode } from "@/types/errors";

const ERROR_MESSAGES: Record<AtlasErrorCode, string> = {
  invalid_file: "This file is not a PDF. Atlas only accepts PDF documents.",
  file_too_large: `This PDF is larger than ${MAX_PDF_SIZE_LABEL}. Choose a smaller file.`,
  invalid_query: "Enter a research question to start.",
  query_too_long: `Keep the research question under ${MAX_QUERY_LENGTH.toLocaleString("en-US")} characters.`,
  pdf_parse_failed: "Atlas could not read this PDF. The file may be damaged.",
  password_protected: "This PDF is password-protected. Atlas cannot open protected documents.",
  empty_pdf: "This PDF has no pages.",
  no_extractable_text:
    "This PDF has no extractable text. It may be scanned or image-only. OCR is not supported yet, so Atlas cannot read it.",
  unsupported_runtime:
    "This browser cannot run the local Atlas runtime. WebAssembly is unavailable.",
  worker_failed:
    "Document processing could not start in this browser. Try again, or use a current version of Chrome, Edge, or Firefox.",
  model_init_failed:
    "Atlas couldn't initialize the local embedding model. Try reloading the page or using a browser with WebGPU support.",
  model_download_failed:
    "Atlas couldn't download the local embedding model. Check your connection and try again. Your PDF was not uploaded.",
  embedding_failed: "Atlas couldn't embed this document locally. Try again with a smaller PDF.",
  dimension_mismatch: "The embedding vectors did not match the index. Start the research again.",
  invalid_vector: "Atlas produced an invalid embedding and stopped before search.",
  empty_document: "This document has no text chunks to search.",
  retrieval_failed: "Atlas couldn't search the document. Try the question again.",
  memory_exhausted: "Atlas ran out of memory while building the semantic index. Try a smaller PDF.",
  too_many_chunks: "This document is too large to process reliably in the browser.",
  llm_init_failed:
    "Atlas couldn't initialize the local answer model. Try again, or reload and use a browser with WebGPU support.",
  llm_download_failed:
    "Atlas couldn't download the local model. Check your connection and try again. Nothing was uploaded.",
  generation_failed: "Atlas couldn't finish the answer locally. Try the question again.",
  structured_output_failed:
    "The local model did not produce a sufficiently supported answer.",
  unexpected:
    "Something went wrong while preparing the document. Nothing was uploaded. Try again.",
};

export function atlasError(code: AtlasErrorCode): AtlasError {
  return new AtlasError(code, ERROR_MESSAGES[code]);
}

export function isAtlasError(value: unknown): value is AtlasError {
  if (value instanceof AtlasError) return true;
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as { name?: unknown; code?: unknown; message?: unknown };
  return (
    candidate.name === "AtlasError" &&
    typeof candidate.message === "string" &&
    typeof candidate.code === "string" &&
    (ATLAS_ERROR_CODES as readonly string[]).includes(candidate.code)
  );
}

export function logDevelopmentError(error: unknown, context: string): void {
  if (process.env.NODE_ENV === "production") return;
  const name = error instanceof Error ? error.name : "unknown";
  console.error(`[atlas] ${context}: ${name}`);
}
