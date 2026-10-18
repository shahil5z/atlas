const DEFAULT_K1 = 1.2;
const DEFAULT_B = 0.75;

export interface Bm25Options {
  k1?: number;
  b?: number;
}

export interface LexicalDocument {
  id: string;
  text: string;
}

/**
 * Lowercases and splits on non-alphanumeric characters.
 * Short tokens are dropped. Terms are not stemmed, so names and technical words stay intact.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
}

/**
 * BM25 over an in-memory chunk list. This is lexical scoring, not a neural reranker.
 */
export function bm25Scores(
  query: string,
  documents: readonly LexicalDocument[],
  options?: Bm25Options,
): Map<string, number> {
  const scores = new Map<string, number>();
  const terms = tokenize(query);
  if (terms.length === 0 || documents.length === 0) return scores;

  const k1 = options?.k1 ?? DEFAULT_K1;
  const b = options?.b ?? DEFAULT_B;
  const tokenized = documents.map((document) => tokenize(document.text));
  const averageLength =
    tokenized.reduce((sum, tokens) => sum + tokens.length, 0) / tokenized.length || 1;

  const documentFrequency = new Map<string, number>();
  for (const tokens of tokenized) {
    for (const term of new Set(tokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  const queryTerms = [...new Set(terms)];
  documents.forEach((document, index) => {
    const tokens = tokenized[index] ?? [];
    const frequencies = new Map<string, number>();
    for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);

    let score = 0;
    for (const term of queryTerms) {
      const frequency = frequencies.get(term) ?? 0;
      if (frequency === 0) continue;
      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log((documents.length - df + 0.5) / (df + 0.5) + 1);
      const numerator = frequency * (k1 + 1);
      const denominator = frequency + k1 * (1 - b + b * (tokens.length / averageLength));
      score += idf * (numerator / denominator);
    }
    scores.set(document.id, score);
  });

  return scores;
}

export function normalizeScores(scores: Map<string, number>): Map<string, number> {
  let max = 0;
  for (const score of scores.values()) {
    if (score > max) max = score;
  }
  const normalized = new Map<string, number>();
  for (const [id, score] of scores) {
    normalized.set(id, max > 0 ? score / max : 0);
  }
  return normalized;
}
