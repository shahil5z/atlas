export const ATLAS_ERROR_CODES = [
  "invalid_file",
  "file_too_large",
  "invalid_query",
  "query_too_long",
  "pdf_parse_failed",
  "password_protected",
  "empty_pdf",
  "no_extractable_text",
  "unsupported_runtime",
  "worker_failed",
  "model_init_failed",
  "model_download_failed",
  "embedding_failed",
  "dimension_mismatch",
  "invalid_vector",
  "empty_document",
  "retrieval_failed",
  "memory_exhausted",
  "too_many_chunks",
  "llm_init_failed",
  "llm_download_failed",
  "generation_failed",
  "structured_output_failed",
  "unexpected",
] as const;

export type AtlasErrorCode = (typeof ATLAS_ERROR_CODES)[number];

export class AtlasError extends Error {
  readonly code: AtlasErrorCode;

  constructor(code: AtlasErrorCode, message: string) {
    super(message);
    this.name = "AtlasError";
    this.code = code;
  }
}
