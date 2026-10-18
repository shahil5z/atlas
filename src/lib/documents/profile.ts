import type { DocumentChunk } from "@/types/documents";

export type DocumentKind =
  | "study_plan"
  | "research_paper"
  | "resume"
  | "report"
  | "technical_doc"
  | "legal"
  | "invoice"
  | "article"
  | "manual"
  | "checklist"
  | "notes"
  | "presentation"
  | "form"
  | "general";

/** Human-readable noun phrase for each type, used in deterministic overviews. */
export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  study_plan: "study plan",
  research_paper: "research paper",
  resume: "resume",
  report: "report",
  technical_doc: "technical document",
  legal: "legal document",
  invoice: "invoice",
  article: "article",
  manual: "manual",
  checklist: "checklist",
  notes: "set of notes",
  presentation: "presentation",
  form: "form",
  general: "document",
};

export type Readability = "text-readable" | "partially-readable" | "image-only" | "mixed-content";

export interface PageText {
  pageNumber: number;
  text: string;
}

export interface DocumentProfile {
  title: string | null;
  pageCount: number;
  textPages: number;
  imagePages: number;
  mixedPages: number;
  estimatedDocumentType: DocumentKind;
  typeConfidence: "low" | "medium" | "high";
  /** Internal 0..1 score. Never shown to the user. */
  typeScore: number;
  /** Repeated numbered units such as "Day 1..20", "Week 1..4", "Step 1..n". */
  repeatedUnit: { label: string; count: number; max: number } | null;
  readability: Readability;
  headings: { text: string; pageNumber: number }[];
  capabilityNote: string | null;
}

const IMAGE_PAGE_CHARS = 24;

/**
 * Rebuilds page text from chunks. Overlapping chunks (800/120) are merged by
 * character offsets so the overlap is not repeated.
 */
export function pagesFromChunks(chunks: readonly DocumentChunk[]): PageText[] {
  const grouped = new Map<number, DocumentChunk[]>();
  for (const chunk of chunks) {
    const parts = grouped.get(chunk.pageNumber) ?? [];
    parts.push(chunk);
    grouped.set(chunk.pageNumber, parts);
  }
  return [...grouped.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([pageNumber, parts]) => {
      const ordered = [...parts].sort((left, right) => left.characterStart - right.characterStart);
      let text = "";
      let end = -1;
      for (const part of ordered) {
        const body = part.text;
        if (end < 0 || part.characterStart >= end || part.characterEnd <= part.characterStart) {
          text += (text ? "\n" : "") + body.trim();
        } else {
          const skip = end - part.characterStart;
          if (skip < body.length) text += body.slice(skip);
        }
        end = Math.max(end, part.characterEnd);
      }
      return { pageNumber, text: text.trim() };
    });
}

function linesOf(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function looksLikeHeading(line: string): boolean {
  if (line.length < 3 || line.length > 80) return false;
  if (/^[•*\-\d]/.test(line)) return false;
  if (/[.!?]$/.test(line) && line.split(/\s+/).length > 10) return false;
  const words = line.split(/\s+/);
  return words.length <= 10;
}

export function profileDocument(pages: readonly PageText[], pageCount: number): DocumentProfile {
  const counted = Math.max(pageCount, pages.length);
  let textPages = 0;
  let imagePages = 0;
  let mixedPages = 0;
  const headings: { text: string; pageNumber: number }[] = [];
  const corpus: string[] = [];

  for (const page of pages) {
    const length = page.text.trim().length;
    corpus.push(page.text);
    if (length === 0 || length < IMAGE_PAGE_CHARS) {
      imagePages += 1;
      continue;
    }
    textPages += 1;
    if (length < 180) mixedPages += 1;
    for (const line of linesOf(page.text).slice(0, 8)) {
      if (looksLikeHeading(line)) headings.push({ text: line, pageNumber: page.pageNumber });
    }
  }

  const blank = Math.max(0, counted - pages.length);
  imagePages += blank;
  const readable = textPages > 0;
  const readability: Readability = !readable
    ? "image-only"
    : imagePages > 0
      ? "mixed-content"
      : mixedPages > 0
        ? "partially-readable"
        : "text-readable";

  const repeatedUnit = detectRepeatedUnit(corpus.join("\n"));
  const classified = classifyDocument(corpus.join("\n"), headings.map((heading) => heading.text), repeatedUnit, counted);
  const titleCandidate = headings[0]?.text ?? linesOf(pages[0]?.text ?? "")[0] ?? null;
  const title = titleCandidate && /ignore (all |previous |prior )?instructions|reveal the system prompt|execute javascript/i.test(titleCandidate)
    ? null
    : titleCandidate;
  const capabilityNote =
    readability === "image-only"
      ? "This PDF has no extractable text. Visual pages were not interpreted."
      : readability === "mixed-content" || imagePages > 0
        ? "Some pages have little or no extractable text. Visual content on those pages was not interpreted."
        : null;

  return {
    title,
    pageCount: counted,
    textPages,
    imagePages,
    mixedPages,
    estimatedDocumentType: classified.kind,
    typeConfidence: classified.confidence,
    typeScore: classified.score,
    repeatedUnit,
    readability,
    headings: headings.slice(0, 24),
    capabilityNote,
  };
}

export function detectRepeatedUnit(text: string): DocumentProfile["repeatedUnit"] {
  let best: DocumentProfile["repeatedUnit"] = null;
  for (const label of ["Day", "Week", "Module", "Unit", "Chapter", "Lesson", "Step", "Session"]) {
    const pattern = new RegExp(`^\\s*${label}\\s+(\\d{1,3})\\b`, "gim");
    const numbers = new Set([...text.matchAll(pattern)].map((match) => Number(match[1])));
    if (numbers.size < 3) continue;
    const max = Math.max(...numbers);
    if (!best || numbers.size > best.count) best = { label, count: numbers.size, max };
  }
  return best;
}

interface Signal {
  kind: DocumentKind;
  patterns: RegExp[];
  bonus?: number;
}

function classifyDocument(
  text: string,
  headings: readonly string[],
  unit: DocumentProfile["repeatedUnit"],
  pageCount: number,
): { kind: DocumentKind; confidence: "low" | "medium" | "high"; score: number } {
  const sample = text.slice(0, 16_000).toLowerCase();
  const head = headings.join("\n").toLowerCase();
  const studyUnit = unit && ["Day", "Week", "Session", "Lesson"].includes(unit.label) ? 2 : 0;
  const bullets = (text.match(/^\s*(?:[•*\-]|\[ ?\]|☐)\s+/gm) ?? []).length;
  const lines = Math.max(1, text.split(/\n/).length);
  const shortPages = pageCount > 0 && text.length / pageCount < 500;
  const signals: Signal[] = [
    { kind: "study_plan", patterns: [/\broadmap\b/, /hard topic/, /easy topic/, /\brevision\b/, /study plan|syllabus/, /\bmcqs?\b/, /\bpriority\s*\d/], bonus: studyUnit },
    { kind: "resume", patterns: [/\bskills?\b/, /\bexperience\b/, /\beducation\b/, /\bresume\b|curriculum vitae/, /\bprojects?\b/, /linkedin|github\.com/] },
    { kind: "research_paper", patterns: [/\babstract\b/, /\breferences\b/, /\bintroduction\b/, /\bconclusions?\b/, /arxiv|et al\./, /\bwe (propose|introduce|present)\b/, /\bbenchmarks?\b|\bbaselines?\b/] },
    { kind: "invoice", patterns: [/\binvoice\b/, /\bsubtotal\b/, /\bamount due\b|\bbalance due\b/, /\bqty\b|\bquantity\b/, /\bbill to\b/] },
    { kind: "legal", patterns: [/\bagreement\b/, /\bwhereas\b/, /\btermination\b/, /\bparties\b/, /\bherein\b|\bhereby\b/, /\bgoverning law\b/] },
    { kind: "manual", patterns: [/\btroubleshooting\b/, /\bwarning\b/, /\binstallation\b/, /\bprocedure\b/, /\buser (guide|manual)\b/] },
    { kind: "technical_doc", patterns: [/\bapi\b/, /\bendpoints?\b/, /\bconfiguration\b/, /\bparameters?\b/, /\bnpm |\bpip |\$ \w+/, /\breturns?\b/, /\barchitecture\b/] },
    { kind: "report", patterns: [/executive summary/, /\bfindings\b/, /\brecommendations?\b/, /\bq[1-4]\b|\bquarter/, /\bkpis?\b/] },
    { kind: "form", patterns: [/\bsignature\b/, /\bdate of birth\b/, /_{5,}/, /\bapplicant\b/, /\bplease (fill|complete)\b/] },
    { kind: "checklist", patterns: [/\bchecklist\b/, /\[ ?\]|☐|✓/, /\bto-?do\b/], bonus: bullets / lines > 0.5 && !studyUnit ? 1 : 0 },
    { kind: "presentation", patterns: [/\bslide\b/, /\bagenda\b/, /\bthank you\b/, /\bq ?& ?a\b/], bonus: shortPages && pageCount >= 5 && bullets < 5 ? 1 : 0 },
    { kind: "article", patterns: [/\bpublished\b/, /\bby [a-z]+ [a-z]+\b/, /\bmin read\b/, /\bcontinue reading\b/] },
    { kind: "notes", patterns: [/\bnotes?\b/, /\blecture\b/, /\bdefinition\b/, /\bexample\b/] },
  ];
  const ranked = signals
    .map((signal) => {
      const hits = signal.patterns.reduce((total, pattern) => total + (pattern.test(sample) ? 1 : 0), 0);
      const headingHits = signal.patterns.reduce((total, pattern) => total + (pattern.test(head) ? 0.5 : 0), 0);
      return { kind: signal.kind, hits: hits + headingHits + (signal.bonus ?? 0), max: signal.patterns.length };
    })
    .sort((left, right) => right.hits - left.hits);
  const best = ranked[0];
  const second = ranked[1]?.hits ?? 0;
  if (!best || best.hits < 2) return { kind: "general", confidence: "low", score: best ? best.hits / 10 : 0 };
  const margin = best.hits - second;
  const score = Math.min(1, best.hits / Math.max(4, best.max) * 0.7 + Math.min(margin, 3) * 0.1);
  const confidence = score >= 0.6 && margin >= 1.5 ? "high" : score >= 0.35 && margin >= 0.5 ? "medium" : "low";
  return { kind: confidence === "low" ? "general" : best.kind, confidence, score };
}
