import { SPARSE_TEXT_CHARACTERS } from "@/config/documents";
import type { ExtractionAssessment, ParsedDocument } from "@/types/documents";

export interface DocumentSummary {
  pageCount: number;
  extractableCharacterCount: number;
  nonEmptyPageCount: number;
  emptyPageCount: number;
}

export function summarizeDocument(document: ParsedDocument): DocumentSummary {
  let extractableCharacterCount = 0;
  let nonEmptyPageCount = 0;

  for (const page of document.pages) {
    const extractable = page.text.trim().length;
    extractableCharacterCount += extractable;
    if (extractable > 0) nonEmptyPageCount += 1;
  }

  const pageCount = document.pages.length;

  return {
    pageCount,
    extractableCharacterCount,
    nonEmptyPageCount,
    emptyPageCount: pageCount - nonEmptyPageCount,
  };
}

export function assessExtraction(document: ParsedDocument): ExtractionAssessment {
  const summary = summarizeDocument(document);

  let quality: ExtractionAssessment["quality"] = "text";
  if (summary.extractableCharacterCount === 0) {
    quality = "no_extractable_text";
  } else if (summary.extractableCharacterCount < SPARSE_TEXT_CHARACTERS) {
    quality = "sparse";
  } else if (summary.emptyPageCount > 0) {
    quality = "partial";
  }

  return { ...summary, quality };
}
