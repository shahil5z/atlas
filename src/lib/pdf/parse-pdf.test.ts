import { describe, expect, it } from "vitest";
import { extractDocument } from "@/lib/pdf/parse-pdf";

function escapePdfText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

/** Builds a one-page Helvetica PDF. ASCII only, so byte offsets match string length. */
export function buildSinglePagePdf(text: string): Uint8Array {
  const stream = `BT /F1 24 Tf 72 720 Td (${escapePdfText(text)}) Tj ET`;
  const objects = [
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n",
    "2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n",
    `4 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n",
  ];

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(body.length);
    body += object;
  }

  const xrefStart = body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }

  const trailer = `trailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`;
  return new TextEncoder().encode(body + xref + trailer);
}

describe("extractDocument", () => {
  it("keeps the page number and extracted text from a real PDF", async () => {
    const result = await extractDocument(buildSinglePagePdf("Hello Atlas"));

    expect(result.pageCount).toBe(1);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.pageNumber).toBe(1);
    expect(result.pages[0]?.text).toContain("Hello Atlas");
  }, 20_000);
});
