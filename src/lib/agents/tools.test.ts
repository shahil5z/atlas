import { describe, expect, it } from "vitest";
import { executeTool } from "@/lib/agents/tools";
import { AtlasError } from "@/types/errors";
import type { RetrievalOutcome } from "@/lib/retrieval/types";

const outcome: RetrievalOutcome = {
  displayQuery: "evidence",
  retrievalQuery: "evidence",
  hits: [],
  context: { sources: [], text: "", tokenEstimate: 0, truncated: false },
  generation: { system: "", userQuery: "evidence", retrievedDocumentContent: "" },
};

describe("research tools", () => {
  it("rejects an unknown tool and invalid arguments", async () => {
    const context = {
      document: { id: "doc", name: "Notes.pdf", pageCount: 1, size: 10 },
      chunks: [],
      retrieve: async () => outcome,
    };
    await expect(executeTool("eval", {}, context)).rejects.toBeInstanceOf(AtlasError);
    await expect(executeTool("retrieveEvidence", { query: "" }, context)).rejects.toBeInstanceOf(AtlasError);
  });

  it("runs retrieveEvidence only with a valid query", async () => {
    const queries: string[] = [];
    const result = await executeTool(
      "retrieveEvidence",
      { query: "semantic retrieval", topK: 3 },
      {
        document: { id: "doc", name: "Notes.pdf", pageCount: 3, size: 10 },
        chunks: [],
        retrieve: async (query) => {
          queries.push(query);
          return outcome;
        },
      },
    );
    expect(queries).toEqual(["semantic retrieval"]);
    expect(result.summary).toContain("Retrieved");
  });

  it("returns an excerpt only for a known chunk", async () => {
    const result = await executeTool(
      "getDocumentExcerpt",
      { chunkId: "p2" },
      {
        document: { id: "doc", name: "Notes.pdf", pageCount: 2, size: 10 },
        chunks: [
          {
            chunkId: "p2",
            documentId: "doc",
            pageNumber: 2,
            text: "Atlas uses semantic retrieval.",
            characterStart: 0,
            characterEnd: 20,
          },
        ],
        retrieve: async () => outcome,
      },
    );
    expect(result.summary).toContain("Page 2");
  });
});
