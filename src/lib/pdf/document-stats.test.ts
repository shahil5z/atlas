import { describe, expect, it } from "vitest";
import { MAX_PDF_SIZE_BYTES } from "@/config/documents";
import { formatFileSize } from "@/lib/format/format-file-size";
import { assemblePageText } from "@/lib/pdf/assemble-page-text";
import { assessExtraction, summarizeDocument } from "@/lib/pdf/document-stats";
import type { ParsedDocument } from "@/types/documents";

function document(pages: { pageNumber: number; text: string }[]): ParsedDocument {
  return {
    id: "doc-9",
    name: "notes.pdf",
    size: 4096,
    pageCount: pages.length,
    pages,
    createdAt: 10,
  };
}

describe("document metadata", () => {
  it("counts pages, empty pages, and extractable characters separately", () => {
    const summary = summarizeDocument(
      document([
        { pageNumber: 1, text: "Finding one." },
        { pageNumber: 2, text: " \n " },
        { pageNumber: 3, text: "Finding three is longer." },
      ]),
    );

    expect(summary).toEqual({
      pageCount: 3,
      nonEmptyPageCount: 2,
      emptyPageCount: 1,
      extractableCharacterCount: "Finding one.".length + "Finding three is longer.".length,
    });
  });

  it("classifies missing, sparse, partial, and full text", () => {
    expect(assessExtraction(document([{ pageNumber: 1, text: "   " }])).quality).toBe(
      "no_extractable_text",
    );
    expect(assessExtraction(document([{ pageNumber: 1, text: "Short note" }])).quality).toBe("sparse");
    expect(
      assessExtraction(
        document([
          { pageNumber: 1, text: "A".repeat(80) },
          { pageNumber: 2, text: "" },
        ]),
      ).quality,
    ).toBe("partial");
    expect(assessExtraction(document([{ pageNumber: 1, text: "A".repeat(80) }])).quality).toBe("text");
  });

  it("formats the 10 MB limit without drifting from the byte constant", () => {
    expect(formatFileSize(MAX_PDF_SIZE_BYTES)).toBe("10.0 MB");
  });
});

describe("assemblePageText", () => {
  it("keeps line breaks from end-of-line markers and ignores empty items", () => {
    const text = assemblePageText([
      { str: "Method", hasEOL: false },
      { str: "section", hasEOL: true },
      { str: "", hasEOL: false },
      { str: "Limitations follow.", hasEOL: true },
    ]);

    expect(text).toBe("Method section\nLimitations follow.");
  });
});
