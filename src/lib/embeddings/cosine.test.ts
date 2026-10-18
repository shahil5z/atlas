import { describe, expect, it } from "vitest";
import { cosineSimilarity } from "@/lib/embeddings/cosine";
import { AtlasError } from "@/types/errors";

const vector = (values: number[]) => Float32Array.from(values);

describe("cosine similarity", () => {
  it("returns 1 for identical vectors and 0 for orthogonal vectors", () => {
    expect(cosineSimilarity(vector([1, 0]), vector([2, 0]))).toBeCloseTo(1);
    expect(cosineSimilarity(vector([1, 0]), vector([0, 1]))).toBeCloseTo(0);
  });

  it("returns 0 for a zero vector", () => {
    expect(cosineSimilarity(vector([0, 0]), vector([1, 2]))).toBe(0);
  });

  it("rejects mismatched dimensions, empty vectors, and non-finite values", () => {
    expect(() => cosineSimilarity(vector([1]), vector([1, 0]))).toThrow(AtlasError);
    expect(() => cosineSimilarity(vector([]), vector([]))).toThrow(AtlasError);
    expect(() => cosineSimilarity(vector([Number.NaN]), vector([1]))).toThrow(AtlasError);
    expect(() => cosineSimilarity(vector([Number.POSITIVE_INFINITY]), vector([1]))).toThrow(AtlasError);
  });
});
