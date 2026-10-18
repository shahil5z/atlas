/**
 * Sentence embedding model used by the browser RAG pipeline.
 * Weights are an application asset. They are not user research data.
 * Transformers.js may cache them with the Cache API. Queries and PDFs are not cached.
 */
export const EMBEDDING_MODEL_ID = "Xenova/all-MiniLM-L6-v2";

/** Hidden size of all-MiniLM-L6-v2. Confirmed again when the model loads. */
export const EMBEDDING_DIMENSION = 384;

export const EMBEDDING_DTYPE = "q8" as const;

/** MiniLM word-piece window. Chunks are sized in characters to stay near this. */
export const EMBEDDING_MAX_TOKENS = 256;

export const EMBED_BATCH_SIZE = 8;

/** Above this many chunks, retrieval scans a pool instead of every vector twice. */
export const FULL_SCAN_CHUNK_LIMIT = 2_000;
