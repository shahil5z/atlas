import { describe, expect, it } from "vitest";
import { chunkDocument, createChunkId } from "@/lib/chunking/chunk-document";
import type { ParsedDocument } from "@/types/documents";

function document(pages: { pageNumber: number; text: string }[]): ParsedDocument {
  return {
    id: "doc-1",
    name: "paper.pdf",
    size: 1200,
    pageCount: pages.length,
    pages,
    createdAt: 1,
  };
}

describe("chunkDocument", () => {
  it("skips empty pages and keeps page numbers on the pages that have text", () => {
    const chunks = chunkDocument(
      document([
        { pageNumber: 1, text: "   \n\t" },
        { pageNumber: 2, text: "Markets worth a closer look." },
        { pageNumber: 3, text: "" },
      ]),
      { chunkSize: 200, overlap: 20 },
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      documentId: "doc-1",
      pageNumber: 2,
      text: "Markets worth a closer look.",
      characterStart: 0,
      characterEnd: "Markets worth a closer look.".length,
    });
  });

  it("keeps the nearest heading on the chunk", () => {
    const chunks = chunkDocument(
      document([{ pageNumber: 1, text: "Daily routine\nStudy for five hours and revise." }]),
      { chunkSize: 200, overlap: 0 },
    );
    expect(chunks[0]?.heading).toBe("Daily routine");
    expect(chunks[0]?.section).toBe("Daily routine");
  });

  it("prefers a paragraph break and does not cross pages", () => {
    const pageOne = `${"A".repeat(140)}\n\n${"B".repeat(220)}`;
    const pageTwo = "Second page finding.";
    const chunks = chunkDocument(
      document([
        { pageNumber: 1, text: pageOne },
        { pageNumber: 4, text: pageTwo },
      ]),
      { chunkSize: 220, overlap: 0 },
    );

    expect(chunks[0]?.text).toBe("A".repeat(140));
    expect(chunks[0]?.text.includes("B")).toBe(false);
    expect(chunks.every((chunk) => chunk.pageNumber === 1 || chunk.pageNumber === 4)).toBe(true);
    expect(chunks.some((chunk) => chunk.text === pageTwo && chunk.pageNumber === 4)).toBe(true);
    expect(chunks.some((chunk) => chunk.text.includes("Second") && chunk.pageNumber === 1)).toBe(false);
  });

  it("uses deterministic ids and exact character spans", () => {
    const text = Array.from({ length: 80 }, (_, index) => `word${index}`).join(" ");
    const source = document([{ pageNumber: 3, text }]);
    const options = { chunkSize: 220, overlap: 40 };
    const first = chunkDocument(source, options);
    const second = chunkDocument(source, options);

    expect(second.map((chunk) => chunk.chunkId)).toEqual(first.map((chunk) => chunk.chunkId));
    expect(first.length).toBeGreaterThan(1);

    for (const chunk of first) {
      expect(chunk.chunkId).toBe(
        createChunkId("doc-1", chunk.pageNumber, Number(chunk.chunkId.split(":")[2]?.slice(1)), chunk.characterStart, chunk.characterEnd),
      );
      expect(text.slice(chunk.characterStart, chunk.characterEnd)).toBe(chunk.text);
      expect(chunk.pageNumber).toBe(3);
    }

    const [opening, following] = first;
    expect(opening && following && following.characterStart < opening.characterEnd).toBe(true);
  });

  it("rejects an overlap that is not smaller than the chunk size", () => {
    expect(() =>
      chunkDocument(document([{ pageNumber: 1, text: "Hello Atlas" }]), {
        chunkSize: 200,
        overlap: 200,
      }),
    ).toThrow(/overlap/i);
  });
});
