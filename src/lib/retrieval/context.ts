import { APPROX_CHARS_PER_TOKEN, DEFAULT_CONTEXT_CHAR_BUDGET } from "@/config/retrieval";
import { createCitation, type Citation } from "@/lib/retrieval/citations";
import type { DocumentChunk } from "@/types/documents";

export interface ContextSource {
  citation: Citation;
  excerpt: string;
  score: number;
  chunkId: string;
  pageNumber: number;
}

export interface RetrievedContext {
  sources: ContextSource[];
  text: string;
  /** Approximate budget figure. Not a model tokenizer count. */
  tokenEstimate: number;
  truncated: boolean;
}

export interface ContextInput {
  documentName: string;
  chunk: DocumentChunk;
  score: number;
}

/**
 * About four characters per English token. Used only to stay inside a context budget.
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / APPROX_CHARS_PER_TOKEN);
}

function sourceBlock(source: ContextSource): string {
  return `${source.citation.label} document="${source.citation.documentName}" page=${source.pageNumber}\n${source.excerpt}`;
}

/**
 * Builds a bounded, ordered context. Retrieved text is data for a future model,
 * not application instructions. Duplicate chunk ids and identical excerpts are dropped.
 */
export function buildRetrievalContext(
  items: readonly ContextInput[],
  characterBudget = DEFAULT_CONTEXT_CHAR_BUDGET,
): RetrievedContext {
  const sources: ContextSource[] = [];
  const seenIds = new Set<string>();
  const seenText = new Set<string>();
  let usedCharacters = 0;
  let truncated = false;

  for (const item of items) {
    const excerpt = item.chunk.text.trim();
    if (excerpt.length === 0) continue;
    if (seenIds.has(item.chunk.chunkId) || seenText.has(excerpt)) continue;

    const citation = createCitation(sources.length, {
      documentId: item.chunk.documentId,
      documentName: item.documentName,
      pageNumber: item.chunk.pageNumber,
      chunkId: item.chunk.chunkId,
    });
    const blockLength = sourceBlock({
      citation,
      excerpt,
      score: item.score,
      chunkId: item.chunk.chunkId,
      pageNumber: item.chunk.pageNumber,
    }).length;

    if (sources.length > 0 && usedCharacters + blockLength > characterBudget) {
      truncated = true;
      break;
    }

    sources.push({
      citation,
      excerpt,
      score: item.score,
      chunkId: item.chunk.chunkId,
      pageNumber: item.chunk.pageNumber,
    });
    seenIds.add(item.chunk.chunkId);
    seenText.add(excerpt);
    usedCharacters += blockLength;
  }

  const text = sources.map(sourceBlock).join("\n\n");
  return {
    sources,
    text,
    tokenEstimate: estimateTokens(text),
    truncated,
  };
}
