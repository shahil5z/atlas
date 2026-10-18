import { describe, expect, it } from "vitest";
import { MemoryVectorIndex } from "@/lib/embeddings/vector-index";
import { evaluateRetrieval, recallAtK } from "@/lib/evaluation/recall";
import { maximalMarginalRelevance } from "@/lib/retrieval/mmr";
import { processQuery } from "@/lib/retrieval/query";
import { SimilarityOrderReranker } from "@/lib/retrieval/rerank";
import { buildVectorRecords, retrieveEvidence } from "@/lib/retrieval/retrieve";
import { AtlasError } from "@/types/errors";
import type { DocumentChunk } from "@/types/documents";

const vector = (values: number[]) => Float32Array.from(values);

function chunk(chunkId: string, pageNumber: number, text: string, documentId = "atlas-notes"): DocumentChunk {
  return {
    chunkId,
    documentId,
    pageNumber,
    text,
    characterStart: 0,
    characterEnd: text.length,
  };
}

const fixture = [
  chunk("p1", 1, "Atlas is a browser-native research system."),
  chunk("p2", 2, "Atlas uses semantic retrieval to find relevant evidence."),
  chunk("p3", 3, "Atlas does not require a database."),
];

const fixtureVectors = [vector([0, 1, 0]), vector([1, 0, 0]), vector([0, 0, 1])];

function indexed() {
  const index = new MemoryVectorIndex();
  index.add(buildVectorRecords(fixture, fixtureVectors));
  return index;
}

describe("retrieval pipeline", () => {
  it("maps chunks to vectors in order and ranks the semantic page first", () => {
    const records = buildVectorRecords(fixture, fixtureVectors);
    expect(records.map((record) => record.chunkId)).toEqual(["p1", "p2", "p3"]);
    expect(records[1]?.embedding).toBe(fixtureVectors[1]);

    const outcome = retrieveEvidence({
      query: "What does Atlas use to find evidence?",
      documentName: "Atlas Notes.pdf",
      chunks: fixture,
      index: indexed(),
      queryVector: vector([1, 0, 0]),
      options: { topK: 3 },
    });

    expect(outcome.displayQuery).toBe("What does Atlas use to find evidence?");
    expect(outcome.hits[0]?.chunkId).toBe("p2");
    expect(outcome.hits[0]?.pageNumber).toBe(2);
    expect(outcome.hits[0]?.citation).toMatchObject({
      label: "[1]",
      documentName: "Atlas Notes.pdf",
      pageNumber: 2,
      chunkId: "p2",
    });
    expect(outcome.hits.map((hit) => hit.rank)).toEqual([1, 2, 3]);
    expect(outcome.hits.map((hit) => hit.score)).toEqual([...outcome.hits.map((hit) => hit.score)].sort((a, b) => b - a));
    expect(outcome.generation.userQuery).toBe(outcome.displayQuery);
    expect(outcome.generation.retrievedDocumentContent).toContain("page=2");
    expect(outcome.generation.system).not.toContain(fixture[1]?.text ?? "");
  });

  it("rejects an empty query, an empty index, and a dimension mismatch", () => {
    const index = indexed();
    expect(() =>
      retrieveEvidence({
        query: "   ",
        documentName: "Atlas Notes.pdf",
        chunks: fixture,
        index,
        queryVector: vector([1, 0, 0]),
      }),
    ).toThrow(AtlasError);

    expect(() =>
      retrieveEvidence({
        query: "evidence",
        documentName: "Atlas Notes.pdf",
        chunks: [],
        index: new MemoryVectorIndex(),
        queryVector: vector([1, 0, 0]),
      }),
    ).toThrow(AtlasError);

    expect(() =>
      retrieveEvidence({
        query: "evidence",
        documentName: "Atlas Notes.pdf",
        chunks: fixture,
        index,
        queryVector: vector([1, 0]),
      }),
    ).toThrow(AtlasError);

    expect(() => buildVectorRecords(fixture, fixtureVectors.slice(0, 2))).toThrow(AtlasError);
  });

  it("limits top-k, drops duplicate excerpts, and keeps the original query spacing for display", () => {
    const duplicate = chunk("p2-copy", 2, fixture[1]?.text ?? "");
    const chunks = [...fixture, duplicate];
    const index = new MemoryVectorIndex();
    index.add(buildVectorRecords(chunks, [...fixtureVectors, vector([1, 0, 0])]));

    const outcome = retrieveEvidence({
      query: "  What   does Atlas use?  ",
      documentName: "Atlas Notes.pdf",
      chunks,
      index,
      queryVector: vector([1, 0, 0]),
      options: { topK: 2 },
    });

    expect(outcome.displayQuery).toBe("What   does Atlas use?");
    expect(outcome.retrievalQuery).toBe("What does Atlas use?");
    expect(outcome.hits).toHaveLength(2);
    expect(new Set(outcome.hits.map((hit) => hit.chunkId)).size).toBe(2);
    const excerpts = outcome.context.sources.map((source) => source.excerpt);
    expect(new Set(excerpts).size).toBe(excerpts.length);
  });

  it("stops the context when the character budget is reached", () => {
    const outcome = retrieveEvidence({
      query: "evidence",
      documentName: "Atlas Notes.pdf",
      chunks: fixture,
      index: indexed(),
      queryVector: vector([1, 0, 0]),
      options: { topK: 3, contextCharacterBudget: 40 },
    });

    expect(outcome.context.truncated).toBe(true);
    expect(outcome.context.sources.length).toBeLessThan(3);
    expect(outcome.context.tokenEstimate).toBeGreaterThan(0);
    expect(outcome.hits.length).toBeGreaterThan(outcome.context.sources.length);
  });

  it("orders candidates with the score reranker and can diversify with MMR", () => {
    const reranker = new SimilarityOrderReranker();
    expect(reranker.id).toBe("similarity-order");
    expect(reranker.rerank("query", [
      { chunkId: "b", score: 0.2 },
      { chunkId: "a", score: 0.9 },
    ]).map((item) => item.chunkId)).toEqual(["a", "b"]);

    const diverse = maximalMarginalRelevance(
      [
        { id: "same-a", vector: vector([1, 0]), relevance: 0.99 },
        { id: "same-b", vector: vector([0.99, 0.01]), relevance: 0.98 },
        { id: "other", vector: vector([0, 1]), relevance: 0.5 },
      ],
      2,
      0,
    );
    expect(diverse[0]).toBe("same-a");
    expect(diverse).toContain("other");

    const mmrChunks = [
      chunk("near-a", 1, "alpha passage"),
      chunk("near-b", 2, "beta passage"),
      chunk("far", 3, "gamma passage"),
    ];
    const mmrIndex = new MemoryVectorIndex();
    mmrIndex.add(
      buildVectorRecords(mmrChunks, [vector([1, 0]), vector([0.99, 0.01]), vector([0, 1])]),
    );
    const outcome = retrieveEvidence({
      query: "evidence",
      documentName: "Atlas Notes.pdf",
      chunks: mmrChunks,
      index: mmrIndex,
      queryVector: vector([1, 0]),
      options: { topK: 2, diversity: "mmr", mmrLambda: 0, semanticWeight: 1, lexicalWeight: 0 },
    });
    expect(outcome.hits.map((hit) => hit.chunkId)).toEqual(["near-a", "far"]);
  });

  it("removes a document from the index so its chunks cannot be retrieved", () => {
    const index = indexed();
    index.remove("atlas-notes");
    expect(index.size()).toBe(0);
    expect(() =>
      retrieveEvidence({
        query: "evidence",
        documentName: "Atlas Notes.pdf",
        chunks: fixture,
        index,
        queryVector: vector([1, 0, 0]),
      }),
    ).toThrow(AtlasError);
  });

  it("collapses whitespace only on the retrieval query", () => {
    expect(processQuery("  Atlas   retrieval  ")).toEqual({
      displayQuery: "Atlas   retrieval",
      retrievalQuery: "Atlas retrieval",
    });
  });
});

describe("recall at k", () => {
  it("measures how many relevant chunks appear in the retrieved prefix", () => {
    expect(recallAtK(["p2"], ["p2", "p1"], 1)).toBe(1);
    expect(recallAtK(["p2", "p3"], ["p1"], 1)).toBe(0);

    const index = indexed();
    const evaluation = evaluateRetrieval(
      [{ id: "evidence", query: "What does Atlas use to find evidence?", relevantChunkIds: ["p2"], topK: 1 }],
      (_query, topK) =>
        retrieveEvidence({
          query: "What does Atlas use to find evidence?",
          documentName: "Atlas Notes.pdf",
          chunks: fixture,
          index,
          queryVector: vector([1, 0, 0]),
          options: { topK },
        }).hits.map((hit) => hit.chunkId),
    );

    expect(evaluation.recallAtK).toBe(1);
    expect(evaluation.failures).toEqual([]);
  });
});
