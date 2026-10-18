import type { ResearchAnswer, StructuredAnswer } from "@/lib/agents/types";
import { createCitation } from "@/lib/retrieval/citations";
import { stripEmphasis } from "@/lib/documents/rewrite";
import type { DocumentChunk } from "@/types/documents";

export interface HostedSection {
  heading: string;
  bullets: string[];
  page: number;
}

export interface HostedDraft {
  overview: string;
  sections: HostedSection[];
}

const MAX_SECTIONS = 5;
const MAX_BULLETS = 3;

/** Keeps a model draft inside the on-screen structure and strips markdown marks. */
export function cleanHostedDraft(value: unknown): HostedDraft | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { overview?: unknown; sections?: unknown };
  const overview = prose(record.overview);
  if (!overview) return null;
  const sections = Array.isArray(record.sections) ? record.sections : [];
  const cleaned: HostedSection[] = [];
  for (const section of sections) {
    if (!section || typeof section !== "object") continue;
    const item = section as { heading?: unknown; bullets?: unknown; page?: unknown };
    const heading = prose(item.heading).replace(/[.]+$/, "");
    const bullets = (Array.isArray(item.bullets) ? item.bullets : [])
      .map((bullet) => prose(bullet))
      .filter((bullet) => bullet.length > 0)
      .slice(0, MAX_BULLETS);
    if (!heading || bullets.length === 0) continue;
    const page = typeof item.page === "number" && Number.isFinite(item.page) ? Math.round(item.page) : 0;
    cleaned.push({ heading: heading.slice(0, 80), bullets, page });
    if (cleaned.length >= MAX_SECTIONS) break;
  }
  return { overview, sections: cleaned };
}

export function hostedToAnswer(
  draft: HostedDraft,
  document: { id: string; name: string } | null,
  chunks: readonly DocumentChunk[],
): ResearchAnswer {
  const citations = citationsFor(draft, document, chunks);
  const structured: StructuredAnswer = {
    overview: withMarker(draft.overview, citations[0]?.label),
    mode: document ? "document_overview" : "model_knowledge",
    sections: draft.sections.map((section) => ({
      heading: section.heading,
      paragraphs: [],
      bullets: section.bullets,
    })),
  };
  return {
    answer: answerText(structured),
    keyFindings: [],
    recommendations: [],
    caveats: [],
    citations,
    knowledgeSource: document ? "document" : "model",
    termination: "sufficient",
    structured,
    provider: "openai",
  };
}

function citationsFor(
  draft: HostedDraft,
  document: { id: string; name: string } | null,
  chunks: readonly DocumentChunk[],
): ResearchAnswer["citations"] {
  if (!document) return [];
  const pages = [...new Set(draft.sections.map((section) => section.page).filter((page) => page > 0))];
  const used = new Set<string>();
  const citations = [];
  for (const pageNumber of pages) {
    const onPage = chunks.filter((chunk) => chunk.pageNumber === pageNumber);
    const chunk = onPage.find((item) => !used.has(item.chunkId)) ?? onPage[0];
    if (!chunk) continue;
    used.add(chunk.chunkId);
    citations.push(
      createCitation(citations.length, {
        documentId: document.id,
        documentName: document.name,
        pageNumber: chunk.pageNumber,
        chunkId: chunk.chunkId,
      }),
    );
  }
  return citations;
}

function withMarker(overview: string, label?: string): string {
  if (!label || overview.includes(label)) return overview;
  return `${overview} ${label}`.trim();
}

function answerText(structured: StructuredAnswer): string {
  const parts = [structured.overview];
  for (const section of structured.sections) {
    parts.push(section.heading);
    if (section.bullets.length > 0) parts.push(section.bullets.map((bullet) => `- ${bullet}`).join("\n"));
  }
  return parts.filter((part) => part.trim().length > 0).join("\n\n");
}

function prose(value: unknown): string {
  if (typeof value !== "string") return "";
  return stripEmphasis(value).replace(/\s+/g, " ").replace(/^(?:#{1,6}\s+)+/, "").trim();
}
