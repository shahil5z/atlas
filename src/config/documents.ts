/** 10 MB. PDFs above this are rejected before they are read. */
export const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024;

export const MAX_PDF_SIZE_LABEL = "10 MB";

export const PDF_FILE_ACCEPT = "application/pdf,.pdf";

/**
 * Pages with fewer extracted characters than this are treated as having
 * very little text. OCR is a future adapter, not a Phase 1 feature.
 */
export const SPARSE_TEXT_CHARACTERS = 40;

export const PDF_WORKER_PATH = "/pdf.worker.min.mjs";

export const PDF_SIGNATURE = "%PDF-";

/** Stops a long PDF from being extracted page by page in the tab. */
export const MAX_PDF_PAGES = 80;

/** Stops a dense PDF from being embedded after the text is already in memory. */
export const MAX_EXTRACTED_CHARACTERS = 320_000;
