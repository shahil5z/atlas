import { EMBEDDING_MODEL_ID } from "@/config/embedding";
import { LOCAL_LLM_CONFIG } from "@/config/llm";
import type { ResearchAnswer, StructuredAnswer } from "@/lib/agents/types";
import { HONEST_FAILURE } from "@/lib/answer/answer-plan";
import { collapse } from "@/lib/documents/clean-text";
import type { ResearchSession } from "@/types/session";

export interface SourceViewModel {
  id: number;
  documentName: string;
  pageNumber: number;
  /** "Day 8" or "3 Results"; omitted when no reliable heading exists. */
  heading?: string;
  /** Supporting span: the part of the passage that best matches the cited claim. */
  snippet: string;
  /** Full passage text, plain text only. */
  passage: string;
  /** Only set when retrieval scores are calibrated. Atlas currently never sets it. */
  relevance?: "high" | "medium";
}

export interface ResearchResultViewModel {
  question: string;
  document: { name: string; pageCount: number } | null;
  answer: {
    structured: StructuredAnswer | null;
    text: string;
    fromModelKnowledge: boolean;
    failed: boolean;
  } | null;
  notes: string[];
  sources: SourceViewModel[];
  process: {
    pagesAnalyzed: number | null;
    passagesRetrieved: number;
    citationsUsed: number;
    totalMs: number | null;
    system: { model: string; embeddings: string; runtime: string };
  };
}

const INTERNAL_NOTE = /planner|synthesi[sz]er|analyst|critic|agent|json|schema|structured|retry|retries|prompt|tool|stack|not usable|fallback|did not return/i;

function modelLabel(id: string): string {
  return (id.split("/").pop() ?? id).replace(/-ONNX$/i, "");
}

const STOP = new Set("a an the of to in on for and or is are was were be it its this that with as by at from".split(" "));

function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9+#&-]*/g) ?? []).filter((word) => (word.length > 1 || /\d/.test(word)) && !STOP.has(word));
}

const UNIT_LINE = /^(day|week|module|chapter|unit|lesson|step|session)\s+\d{1,3}\b/i;
const NUMBERED_LINE = /^\d{1,2}(\.\d+)?\s+[A-Z][A-Za-z-]+(\s+[A-Za-z-]+){0,6}$/;

function isListy(lines: readonly string[]): boolean {
  return lines.length >= 4 && lines.filter((line) => line.length < 70).length / lines.length > 0.6;
}

const SNIPPET_MAX = 260;

/**
 * Picks the sentence (or short window of sentences, or a block of list lines)
 * with the most lexical overlap with the cited claim. Short passages are shown whole.
 */
export function selectSnippet(passage: string, claim: string): string {
  const flat = collapse(passage);
  if (flat.length <= 200) return flat;
  const wanted = new Set(words(claim.replace(/\[\d+\]/g, " ")));
  const lines = passage.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const listy = isListy(lines);
  const parts = listy ? lines : flat.split(/(?<=[.!?])\s+/).map((unit) => unit.trim()).filter(Boolean);
  if (wanted.size === 0 || parts.length === 0) return clip(flat);
  const maxSize = listy ? 9 : 3;
  let best = { score: -Infinity, start: 0, end: 1 };
  for (let start = 0; start < parts.length; start += 1) {
    for (let size = 1; size <= maxSize && start + size <= parts.length; size += 1) {
      const slice = parts.slice(start, start + size);
      if (size > 1 && slice.join(" ").length > SNIPPET_MAX) break;
      const seen = new Set(words(slice.join(" ")));
      const hits = [...wanted].filter((word) => seen.has(word)).length;
      const header = listy && UNIT_LINE.test(slice[0] ?? "") ? 0.5 : 0;
      const length = Math.min(slice.join(" ").length, 180) / 360;
      const score = hits + header + length - size * (listy ? 0.04 : 0.3);
      if (score > best.score) best = { score, start, end: start + size };
    }
  }
  const chosen = parts.slice(best.start, best.end);
  const text = listy ? chosen.map((part) => part.replace(/^[•*-]\s*/, "")).join(" · ") : chosen.join(" ");
  return clip(collapse(text));
}

function clip(text: string): string {
  return text.length <= SNIPPET_MAX ? text : `${text.slice(0, SNIPPET_MAX).replace(/\s+\S*$/, "")}…`;
}

function titleCase(word: string): string {
  return `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`;
}

/** Heading for the snippet: the nearest unit/numbered heading above it in the passage, else the chunk section. */
function headingFor(passage: string, snippet: string, section?: string): string | undefined {
  const lines = passage.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const probe = snippet.split(" · ")[0]?.replace(/…$/, "").slice(0, 24) ?? "";
  let index = lines.findIndex((line) => collapse(line).includes(probe) || (line.length > 3 && probe.includes(collapse(line).slice(0, 24))));
  if (index === -1) index = 0;
  for (let at = index; at >= 0; at -= 1) {
    const line = lines[at] ?? "";
    const unit = line.match(/^(day|week|module|chapter|unit|lesson|step|session)\s+(\d{1,3})\b/i);
    if (unit) {
      const subject = lines.slice(at + 1, at + 4).map((item) => item.match(/^[•*-]\s*(.{2,40})$/)?.[1]).find(Boolean);
      return `${titleCase(unit[1] ?? "")} ${unit[2]}${subject ? `, ${subject}` : ""}`;
    }
    if (NUMBERED_LINE.test(line)) return line;
  }
  const range = section?.match(/^(Day|Week|Module|Chapter|Unit|Lesson|Step|Session)s (\d+)–\d+$/);
  if (range) {
    // A passage that opens before its first unit (title, routine) has no single unit heading.
    if (!/^[•*-]|^(hard|easy)\s+topic/i.test(lines[0] ?? "")) return undefined;
    const subject = lines.slice(0, 3).map((item) => item.match(/^[•*-]\s*(.{2,40})$/)?.[1]).find(Boolean);
    return `${range[1]} ${range[2]}${subject ? `, ${subject}` : ""}`;
  }
  if (!section || section.length > 70) return undefined;
  return section;
}

/** Claims that cite a given marker: the sentence or bullet containing "[id]". */
export function claimsFor(answer: ResearchAnswer, id: number): string {
  const label = `[${id}]`;
  const structured = answer.structured;
  const pieces = structured
    ? [structured.overview, ...structured.sections.flatMap((section) => [...section.paragraphs, ...section.bullets])]
    : answer.answer.split(/\n+/);
  return pieces
    .filter((piece) => piece.includes(label))
    .join(" ");
}

export function buildResultViewModel(session: ResearchSession): ResearchResultViewModel {
  const answer = session.answer;
  const chunks = new Map(session.chunks.map((chunk) => [chunk.chunkId, chunk]));
  const sources: SourceViewModel[] = (answer?.citations ?? []).map((citation) => {
    const chunk = chunks.get(citation.chunkId);
    const passage = chunk?.text.trim() ?? "";
    const snippet = selectSnippet(passage, answer ? claimsFor(answer, citation.id) : "");
    const heading = headingFor(passage, snippet, chunk?.section);
    return {
      id: citation.id,
      documentName: citation.documentName,
      pageNumber: citation.pageNumber,
      ...(heading ? { heading } : {}),
      snippet,
      passage,
    };
  });
  const prep = session.metrics;
  const prepMs = [prep.parseMs, prep.chunkMs, prep.embeddingInitMs, prep.embeddingMs, prep.indexingMs].reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const runMs = session.runMetrics?.totalMs ?? null;
  const failed = answer?.answer === HONEST_FAILURE;
  return {
    question: session.query,
    document: session.document ? { name: session.document.name, pageCount: session.document.pageCount } : null,
    answer: answer
      ? {
          structured: answer.structured ?? null,
          text: answer.answer,
          fromModelKnowledge: answer.knowledgeSource === "model" || !session.document,
          failed,
        }
      : null,
    notes: (answer?.caveats ?? []).filter((note) => !INTERNAL_NOTE.test(note)),
    sources,
    process: {
      pagesAnalyzed: session.document ? session.document.pageCount : null,
      passagesRetrieved: session.runMetrics?.retrievedChunks ?? 0,
      citationsUsed: sources.length,
      totalMs: runMs === null && prepMs === 0 ? null : (runMs ?? 0) + prepMs,
      system: {
        model: answer?.provider === "openai" ? "OpenAI" : modelLabel(LOCAL_LLM_CONFIG.modelId),
        embeddings: modelLabel(EMBEDDING_MODEL_ID),
        runtime: session.embedding ? (session.embedding.device === "webgpu" ? "WebGPU" : "WASM") : "Browser",
      },
    },
  };
}

function withoutMarkers(text: string): string {
  return text.replace(/\*\*/g, "").replace(/__/g, "").replace(/\s*\[\d+\]/g, "").trim();
}

/** Plain-text copy of the answer for the clipboard (explicit click only). */
export function answerAsPlainText(view: ResearchResultViewModel): string {
  const lines: string[] = [view.question, ""];
  const structured = view.answer?.structured;
  if (structured) {
    lines.push(withoutMarkers(structured.overview));
    for (const section of structured.sections) {
      lines.push("");
      if (section.heading) lines.push(section.heading);
      lines.push(...section.paragraphs.map(withoutMarkers).filter(Boolean));
      lines.push(
        ...section.bullets
          .map((bullet) => withoutMarkers(bullet))
          .filter(Boolean)
          .map((bullet) => (/^\d+[.)]\s/.test(bullet) ? bullet : `- ${bullet}`)),
      );
    }
  } else if (view.answer) {
    lines.push(withoutMarkers(view.answer.text));
  }
  return lines.join("\n").trim();
}
