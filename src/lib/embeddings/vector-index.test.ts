import { describe, expect, it } from "vitest";
import { MemoryVectorIndex, clearResearchIndex, getResearchIndex } from "@/lib/embeddings/vector-index";
import { AtlasError } from "@/types/errors";

const vector = (values: number[]) => Float32Array.from(values);

function record(chunkId: string, values: number[], documentId = "doc-a") {
  return {
    id: chunkId,
    chunkId,
    documentId,
    pageNumber: 1,
    embedding: vector(values),
  };
}

describe("memory vector index", () => {
  it("ranks by cosine similarity and respects top-k", () => {
    const index = new MemoryVectorIndex();
    index.add([
      record("far", [0, 1]),
      record("near", [1, 0]),
      record("mid", [0.7, 0.7]),
    ]);

    const hits = index.search(vector([1, 0]), { topK: 2 });
    expect(hits.map((hit) => hit.chunkId)).toEqual(["near", "mid"]);
    expect(hits[0]?.score).toBeGreaterThan(hits[1]?.score ?? 0);
  });

  it("returns nothing for an empty index and rejects a bad query vector", () => {
    const index = new MemoryVectorIndex();
    expect(index.search(vector([1, 0]), { topK: 5 })).toEqual([]);
    index.add([record("a", [1, 0])]);
    expect(() => index.search(vector([1, 0, 0]), { topK: 1 })).toThrow(AtlasError);
    expect(() => index.add([record("bad", [Number.NaN, 1])])).toThrow(AtlasError);
  });

  it("removes one document and can be cleared", () => {
    const index = new MemoryVectorIndex();
    index.add([record("a", [1, 0], "doc-a"), record("b", [0, 1], "doc-b")]);
    index.remove("doc-a");
    expect(index.size()).toBe(1);
    expect(index.search(vector([0, 1]), { topK: 5 })[0]?.chunkId).toBe("b");
    index.clear();
    expect(index.size()).toBe(0);
    expect(index.dimensionSize).toBeNull();
  });

  it("clears the shared research index", () => {
    const index = getResearchIndex();
    index.add([record("shared", [1, 0])]);
    clearResearchIndex();
    expect(getResearchIndex().size()).toBe(0);
  });
});
