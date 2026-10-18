import { hostedToAnswer, type HostedDraft } from "@/lib/openai/shape";
import type { ResearchAnswer } from "@/lib/agents/types";
import type { DocumentChunk } from "@/types/documents";

const MAX_PAGES = 40;
const MAX_PAGE_CHARS = 4_000;

/**
 * Asks the server to write the answer with OpenAI.
 * Returns null for a missing key, an expired key, a quota error, or any other failure
 * so the caller can use the local answer path.
 */
export async function requestHostedAnswer(input: {
  query: string;
  document: { id: string; name: string } | null;
  chunks: readonly DocumentChunk[];
  signal: AbortSignal;
}): Promise<ResearchAnswer | null> {
  try {
    const response = await fetch("/api/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: input.query,
        documentName: input.document?.name,
        pages: pagesFrom(input.chunks),
      }),
      signal: input.signal,
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { ok?: boolean; draft?: HostedDraft };
    if (!payload.ok || !payload.draft) return null;
    return hostedToAnswer(payload.draft, input.document, input.chunks);
  } catch {
    return null;
  }
}

function pagesFrom(chunks: readonly DocumentChunk[]): { pageNumber: number; text: string }[] {
  const byPage = new Map<number, string[]>();
  for (const chunk of chunks) {
    const list = byPage.get(chunk.pageNumber) ?? [];
    list.push(chunk.text);
    byPage.set(chunk.pageNumber, list);
  }
  return [...byPage.entries()]
    .sort((left, right) => left[0] - right[0])
    .slice(0, MAX_PAGES)
    .map(([pageNumber, parts]) => ({ pageNumber, text: parts.join(" ").slice(0, MAX_PAGE_CHARS) }));
}
