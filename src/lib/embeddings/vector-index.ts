import { cosineSimilarity } from "@/lib/embeddings/cosine";
import { atlasError } from "@/lib/errors/atlas-error";

export interface VectorRecord {
  id: string;
  chunkId: string;
  documentId: string;
  pageNumber: number;
  embedding: Float32Array;
}

export interface VectorSearchOptions {
  topK: number;
  minScore?: number;
}

export interface VectorHit {
  chunkId: string;
  documentId: string;
  pageNumber: number;
  score: number;
  embedding: Float32Array;
}

/**
 * In-memory cosine index. It is not written to disk, IndexedDB, or a server.
 * Text stays on the chunk; this store keeps vectors and citation keys only.
 */
export class MemoryVectorIndex {
  private records: VectorRecord[] = [];
  private dimension: number | null = null;

  add(records: readonly VectorRecord[]): void {
    for (const record of records) {
      this.assertVector(record.embedding);
      if (this.dimension === null) this.dimension = record.embedding.length;
      if (record.embedding.length !== this.dimension) throw atlasError("dimension_mismatch");
      this.records.push(record);
    }
  }

  search(query: Float32Array, options: VectorSearchOptions): VectorHit[] {
    this.assertVector(query);
    if (this.records.length === 0) return [];
    if (this.dimension !== null && query.length !== this.dimension) {
      throw atlasError("dimension_mismatch");
    }

    const topK = Math.max(0, Math.floor(options.topK));
    if (topK === 0) return [];

    const ranked = this.records
      .map((record) => ({
        chunkId: record.chunkId,
        documentId: record.documentId,
        pageNumber: record.pageNumber,
        score: cosineSimilarity(query, record.embedding),
        embedding: record.embedding,
      }))
      .filter((hit) => options.minScore === undefined || hit.score >= options.minScore)
      .sort((left, right) => right.score - left.score || left.chunkId.localeCompare(right.chunkId));

    return ranked.slice(0, topK);
  }

  remove(documentId: string): void {
    this.records = this.records.filter((record) => record.documentId !== documentId);
    if (this.records.length === 0) this.dimension = null;
  }

  clear(): void {
    this.records = [];
    this.dimension = null;
  }

  size(): number {
    return this.records.length;
  }

  get dimensionSize(): number | null {
    return this.dimension;
  }

  private assertVector(vector: Float32Array): void {
    if (vector.length === 0) throw atlasError("invalid_vector");
    for (const value of vector) {
      if (!Number.isFinite(value)) throw atlasError("invalid_vector");
    }
  }
}

let researchIndex: MemoryVectorIndex | null = null;

export function getResearchIndex(): MemoryVectorIndex {
  researchIndex ??= new MemoryVectorIndex();
  return researchIndex;
}

export function clearResearchIndex(): void {
  researchIndex?.clear();
}
