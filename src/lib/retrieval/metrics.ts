export interface PipelineMetrics {
  parseMs: number | null;
  chunkMs: number | null;
  embeddingInitMs: number | null;
  embeddingMs: number | null;
  indexingMs: number | null;
  queryEmbeddingMs: number | null;
  retrievalMs: number | null;
}

export function emptyMetrics(): PipelineMetrics {
  return {
    parseMs: null,
    chunkMs: null,
    embeddingInitMs: null,
    embeddingMs: null,
    indexingMs: null,
    queryEmbeddingMs: null,
    retrievalMs: null,
  };
}

export function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null || !Number.isFinite(milliseconds)) return "—";
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  return `${(milliseconds / 1000).toFixed(2)} s`;
}
