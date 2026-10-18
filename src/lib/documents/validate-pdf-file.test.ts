import { describe, expect, it } from "vitest";
import { MAX_PDF_SIZE_BYTES } from "@/config/documents";
import { pdfSizeError, validatePdfFile } from "@/lib/documents/validate-pdf-file";

describe("pdf size validation", () => {
  it("rejects empty and non-finite sizes", () => {
    expect(pdfSizeError(0)?.code).toBe("invalid_file");
    expect(pdfSizeError(-1)?.code).toBe("invalid_file");
    expect(pdfSizeError(Number.NaN)?.code).toBe("invalid_file");
  });

  it("accepts a file at the 10 MB limit and rejects one byte over", () => {
    expect(pdfSizeError(MAX_PDF_SIZE_BYTES)).toBeNull();
    expect(pdfSizeError(MAX_PDF_SIZE_BYTES + 1)?.code).toBe("file_too_large");
    expect(pdfSizeError(MAX_PDF_SIZE_BYTES + 1)?.message).toContain("10 MB");
  });
});

describe("validatePdfFile", () => {
  it("rejects an empty file", async () => {
    const file = new File([], "empty.pdf", { type: "application/pdf" });
    const result = await validatePdfFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid_file");
  });

  it("rejects a non-PDF", async () => {
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    const result = await validatePdfFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid_file");
  });

  it("rejects a renamed file whose bytes are not a PDF", async () => {
    const file = new File(["not a pdf"], "paper.pdf", { type: "application/pdf" });
    const result = await validatePdfFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("PDF");
  });

  it("accepts a small file that starts with the PDF signature", async () => {
    const file = new File([new TextEncoder().encode("%PDF-1.7\n")], "paper.pdf", {
      type: "application/octet-stream",
    });
    const result = await validatePdfFile(file);
    expect(result.ok).toBe(true);
  });

  it("rejects an oversized PDF without reading it as valid", async () => {
    const file = new File([new TextEncoder().encode("%PDF-1.7")], "large.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(file, "size", { value: MAX_PDF_SIZE_BYTES + 5 });
    const result = await validatePdfFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("file_too_large");
  });
});
