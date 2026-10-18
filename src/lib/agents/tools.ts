import { z } from "zod";
import { DEFAULT_TOP_K } from "@/config/retrieval";
import { atlasError } from "@/lib/errors/atlas-error";
import type { DocumentChunk } from "@/types/documents";
import type { RetrievalOutcome } from "@/lib/retrieval/types";

const retrieveArgs = z
  .object({
    query: z.string().trim().min(1).max(500),
    topK: z.coerce.number().int().min(1).max(8).optional(),
  })
  .strict();

const excerptArgs = z
  .object({
    chunkId: z.string().trim().min(1).max(200),
  })
  .strict();

const metadataArgs = z.object({}).strict();

export interface ToolDocument {
  id: string;
  name: string;
  pageCount: number;
  size: number;
}

export interface ToolContext {
  document: ToolDocument | null;
  chunks: readonly DocumentChunk[];
  retrieve: (query: string, topK: number) => Promise<RetrievalOutcome>;
}

export interface ToolExecution {
  name: string;
  summary: string;
  retrieval: RetrievalOutcome | null;
}

const TOOLS = {
  retrieveEvidence: {
    description: "Search the attached document for passages relevant to a query.",
    schema: retrieveArgs,
  },
  getDocumentMetadata: {
    description: "Read the attached document name, size, and page count.",
    schema: metadataArgs,
  },
  getDocumentExcerpt: {
    description: "Read one chunk that was extracted from the attached document.",
    schema: excerptArgs,
  },
} as const;

export type ToolName = keyof typeof TOOLS;

export function isToolName(value: string): value is ToolName {
  return value in TOOLS;
}

/**
 * Runs a tool only after the name and arguments match a registered schema.
 * Model text is never evaluated as code.
 */
export async function executeTool(
  name: string,
  args: unknown,
  context: ToolContext,
): Promise<ToolExecution> {
  if (!isToolName(name)) throw atlasError("generation_failed");
  const parsed = TOOLS[name].schema.safeParse(args ?? {});
  if (!parsed.success) throw atlasError("generation_failed");

  if (name === "getDocumentMetadata") {
    if (!context.document) {
      return { name, summary: "No document is attached.", retrieval: null };
    }
    return {
      name,
      summary: `${context.document.name}, ${context.document.pageCount} pages.`,
      retrieval: null,
    };
  }

  if (name === "getDocumentExcerpt") {
    const chunkId = excerptArgs.parse(parsed.data).chunkId;
    const chunk = context.chunks.find((item) => item.chunkId === chunkId);
    if (!chunk) return { name, summary: "That passage is not in the document.", retrieval: null };
    return { name, summary: `Page ${chunk.pageNumber}: ${chunk.text.slice(0, 400)}`, retrieval: null };
  }

  const retrieve = retrieveArgs.parse(parsed.data);
  if (!context.document) {
    return { name, summary: "No document is attached, so nothing was searched.", retrieval: null };
  }
  const retrieval = await context.retrieve(retrieve.query, retrieve.topK ?? DEFAULT_TOP_K);
  return {
    name,
    summary: `Retrieved ${retrieval.hits.length} passages for “${retrieve.query}”.`,
    retrieval,
  };
}
