/**
 * Character budgets for the baseline chunker.
 * Page boundaries are never crossed so citations can stay page-accurate.
 * 800 characters stays near the MiniLM 256-token window. This is not a token count.
 */
export const DEFAULT_CHUNK_SIZE = 800;

export const DEFAULT_CHUNK_OVERLAP = 120;

export const MIN_CHUNK_SIZE = 200;

export const MAX_CHUNK_SIZE = 8_000;

export const MAX_CHUNK_OVERLAP = 2_000;

/** Stops a text-heavy PDF from creating an unbounded in-memory index. */
export const MAX_INDEX_CHUNKS = 400;
