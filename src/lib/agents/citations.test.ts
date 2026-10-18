import { describe, expect, it } from "vitest";
import { validateAnswerCitations, type EvidenceRef } from "@/lib/agents/citations";

const evidence: EvidenceRef[] = [
  {
    citation: {
      id: 1,
      label: "[1]",
      documentId: "doc",
      documentName: "Notes.pdf",
      pageNumber: 2,
      chunkId: "p2",
    },
    chunkId: "p2",
    pageNumber: 2,
    documentId: "doc",
    documentName: "Notes.pdf",
    excerpt: "Atlas uses semantic retrieval.",
  },
];

describe("citation validation", () => {
  it("keeps a citation that matches a retrieved chunk", () => {
    const result = validateAnswerCitations("Atlas uses semantic retrieval [1].", [{ chunkId: "p2" }], evidence);
    expect(result.citations.map((item) => item.chunkId)).toEqual(["p2"]);
    expect(result.answer).toContain("[1]");
    expect(result.removedCount).toBe(0);
  });

  it("removes invented chunk ids and invented page markers", () => {
    const result = validateAnswerCitations("See [9] and [1].", [{ chunkId: "missing" }], evidence);
    expect(result.citations.map((item) => item.chunkId)).toEqual(["p2"]);
    expect(result.answer).not.toContain("[9]");
    expect(result.answer).toContain("[1]");
    expect(result.removedCount).toBeGreaterThan(0);
  });
});
