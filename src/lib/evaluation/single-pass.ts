import { validateAnswerCitations } from "@/lib/agents/citations";
import { runResearch } from "@/lib/agents/orchestrator";
import type { LanguageModel } from "@/lib/agents/types";
import type { EvidenceRef } from "@/lib/agents/citations";

export interface ModeComparison {
  mode: "single-pass" | "orchestrated";
  ms: number;
  generatedTokens: number | null;
  citationValidity: number;
  containsExpectedPhrase: boolean;
  iterations: number;
  failed: boolean;
}

const evidence: EvidenceRef = {
  chunkId: "p2",
  pageNumber: 2,
  documentId: "doc",
  documentName: "Notes.pdf",
  excerpt: "Atlas uses semantic retrieval.",
  citation: {
    id: 1,
    label: "[1]",
    documentId: "doc",
    documentName: "Notes.pdf",
    pageNumber: 2,
    chunkId: "p2",
  },
};

/**
 * One local generation, then the same citation check the orchestrator uses.
 * This exists for evaluation. The product path stays on the orchestrator.
 */
export async function runSinglePass(model: LanguageModel, query: string, signal: AbortSignal): Promise<ModeComparison> {
  const started = performance.now();
  try {
    const result = await model.generate({
      system: "Answer in plain sentences. Do not invent URLs or page numbers.",
      user: query,
      maxNewTokens: 120,
      temperature: 0.3,
      doSample: true,
      signal,
    });
    const validated = validateAnswerCitations(result.text, [], [evidence]);
    const decided = validated.citations.length + validated.removedCount;
    return {
      mode: "single-pass",
      ms: performance.now() - started,
      generatedTokens: result.tokenCount,
      citationValidity: decided === 0 ? 1 : validated.citations.length / decided,
      containsExpectedPhrase: result.text.toLowerCase().includes("semantic retrieval"),
      iterations: 1,
      failed: false,
    };
  } catch {
    return {
      mode: "single-pass",
      ms: performance.now() - started,
      generatedTokens: null,
      citationValidity: 0,
      containsExpectedPhrase: false,
      iterations: 0,
      failed: true,
    };
  }
}

export async function compareModes(input: {
  single: LanguageModel;
  orchestrated: LanguageModel;
  query: string;
}): Promise<{ single: ModeComparison; orchestrated: ModeComparison }> {
  const signal = new AbortController().signal;
  const single = await runSinglePass(input.single, input.query, signal);
  const started = performance.now();
  const run = await runResearch({
    runId: "compare",
    query: input.query,
    document: { id: "doc", name: "Notes.pdf", pageCount: 2, size: 20 },
    chunks: [
      {
        chunkId: "p2",
        documentId: "doc",
        pageNumber: 2,
        text: "Atlas uses semantic retrieval.",
        characterStart: 0,
        characterEnd: 32,
      },
    ],
    model: input.orchestrated,
    retrieve: async () => ({
      displayQuery: input.query,
      retrievalQuery: input.query,
      hits: [
        {
          rank: 1,
          score: 0.9,
          semanticScore: 0.9,
          lexicalScore: 0,
          chunkId: "p2",
          documentId: "doc",
          pageNumber: 2,
          citation: evidence.citation,
        },
      ],
      context: { sources: [], text: evidence.excerpt, tokenEstimate: 8, truncated: false },
      generation: { system: "", userQuery: input.query, retrievedDocumentContent: evidence.excerpt },
    }),
    signal,
  });
  const decided = (run.answer?.citations.length ?? 0) + (run.answer?.answer.includes("[9]") ? 1 : 0);
  return {
    single,
    orchestrated: {
      mode: "orchestrated",
      ms: performance.now() - started,
      generatedTokens: run.metrics.generatedTokens,
      citationValidity: run.answer && run.answer.citations.length > 0 ? 1 : decided === 0 ? 1 : 0,
      containsExpectedPhrase: (run.answer?.answer ?? "").toLowerCase().includes("semantic retrieval"),
      iterations: run.metrics.iterations,
      failed: run.status !== "completed",
    },
  };
}
