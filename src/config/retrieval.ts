export const DEFAULT_TOP_K = 5;

export const CANDIDATE_POOL_FACTOR = 8;

/**
 * Hybrid score = semanticWeight * cosine + lexicalWeight * normalized BM25.
 * Semantic weight is higher because paraphrases matter more than exact term overlap.
 * Both weights are configurable and are not learned.
 */
export const SEMANTIC_WEIGHT = 0.8;

export const LEXICAL_WEIGHT = 0.2;

/** Character budget for the future generator. Not an exact token limit. */
export const DEFAULT_CONTEXT_CHAR_BUDGET = 6_000;

/**
 * Rough English estimate used only for budgeting.
 * This is not a tokenizer count.
 */
export const APPROX_CHARS_PER_TOKEN = 4;

export const DEFAULT_MMR_LAMBDA = 0.7;
