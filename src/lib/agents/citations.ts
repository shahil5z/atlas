import type { Citation } from "@/lib/retrieval/citations";

export interface EvidenceRef {
  citation: Citation;
  chunkId: string;
  pageNumber: number;
  documentId: string;
  documentName: string;
  excerpt: string;
}

export interface ValidatedCitations {
  answer: string;
  citations: Citation[];
  removedCount: number;
}

/**
 * Keeps a citation only when its chunk was actually retrieved.
 * A bracket number is kept only when it matches a label in that evidence pack.
 */
export function validateAnswerCitations(
  answer: string,
  claimed: readonly { chunkId: string }[],
  evidence: readonly EvidenceRef[],
): ValidatedCitations {
  const byLabel = new Map(evidence.map((item) => [item.citation.id, item]));
  const allowedIds = new Set(evidence.map((item) => item.chunkId));
  const selected = new Map<string, EvidenceRef>();
  let removedCount = 0;

  for (const item of claimed) {
    if (!allowedIds.has(item.chunkId)) {
      removedCount += 1;
      continue;
    }
    const match = evidence.find((entry) => entry.chunkId === item.chunkId);
    if (match) selected.set(match.chunkId, match);
  }

  const cleaned = answer.replace(/\[(\d+)\]/g, (marker, raw: string) => {
    const label = Number(raw);
    const item = byLabel.get(label);
    if (!item) {
      removedCount += 1;
      return "";
    }
    selected.set(item.chunkId, item);
    return marker;
  });

  return {
    answer: cleaned.replace(/[ \t]{2,}/g, " ").trim(),
    citations: [...selected.values()].map((item) => item.citation),
    removedCount,
  };
}
