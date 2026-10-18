import { z } from "zod";
import { detectArtifacts } from "@/lib/documents/clean-text";
import type { AnswerSection, StructuredAnswer } from "@/lib/agents/types";

export const ANSWER_MODES = [
  "document_overview",
  "document_summary",
  "specific_answer",
  "fact",
  "list",
  "comparison",
  "extraction",
  "recommendation",
  "page_summary",
  "model_knowledge",
  "unsupported",
] as const;

export type AnswerMode = (typeof ANSWER_MODES)[number];

const line = z.string().trim().min(1).max(900);

export const answerSectionSchema = z.object({
  heading: z.string().trim().max(90),
  paragraphs: z.array(line).max(4).default([]),
  /** Ordered lists are written as "1. …" bullets; the renderer turns them into <ol>. */
  bullets: z.array(line).max(14).default([]),
  table: z
    .object({
      caption: z.string().max(140).optional(),
      headers: z.array(z.string().max(60)).min(1).max(6),
      rows: z.array(z.array(z.string().max(200))).max(30),
    })
    .optional(),
});

/** What Atlas intends to say. Sections are optional and conditional, never a forced template. */
export const answerPlanSchema = z.object({
  mode: z.enum(ANSWER_MODES),
  summary: z.string().trim().min(1).max(1200),
  sections: z.array(answerSectionSchema).max(6).default([]),
  caveats: z.array(z.string().trim().min(1).max(300)).max(4).default([]),
});

export type AnswerPlan = z.infer<typeof answerPlanSchema>;

export function planToStructured(plan: AnswerPlan): StructuredAnswer {
  return {
    overview: plan.summary,
    mode: plan.mode,
    sections: plan.sections.map((section): AnswerSection => ({
      heading: section.heading,
      paragraphs: section.paragraphs,
      bullets: section.bullets,
      ...(section.table ? { table: section.table } : {}),
    })),
  };
}

export function planText(plan: AnswerPlan): string {
  const parts = [plan.summary];
  for (const section of plan.sections) {
    if (section.heading) parts.push(section.heading);
    parts.push(...section.paragraphs);
    if (section.bullets.length > 0) parts.push(section.bullets.map((bullet) => (/^\d+[.)]\s/.test(bullet) ? bullet : `- ${bullet}`)).join("\n"));
  }
  return parts.filter((part) => part.trim().length > 0).join("\n\n");
}

export interface QualityReport {
  ok: boolean;
  issues: string[];
  citationValidity: number;
  artifactRate: number;
  words: number;
  relevance: number;
}

const STOP = new Set("a an the of to in on for and or is are was were be what which who how why when this that these those it its pdf document file about me tell does do give list please my i".split(" "));

export function contentWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9+#.-]*/g) ?? [])
    .map((word) => word.replace(/[.-]+$/, ""))
    .filter((word) => word.length > 1 && !STOP.has(word));
}

/** Word budget per mode: narrow questions must get narrow answers. */
export const WORD_BUDGET: Record<AnswerMode, number> = {
  document_overview: 260,
  document_summary: 340,
  specific_answer: 140,
  fact: 80,
  list: 220,
  comparison: 260,
  extraction: 160,
  recommendation: 200,
  page_summary: 200,
  model_knowledge: 260,
  unsupported: 80,
};

/**
 * Deterministic quality gate: citations must map to real evidence (no [99]),
 * artifacts must be rare, the answer must fit the mode's budget, and a narrow
 * answer must share vocabulary with the question.
 */
export function checkAnswerQuality(input: {
  plan: AnswerPlan;
  query: string;
  validLabels: ReadonlySet<number>;
  requireCitations: boolean;
}): QualityReport {
  const text = planText(input.plan);
  const issues: string[] = [];
  const markers = [...text.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1]));
  const valid = markers.filter((id) => input.validLabels.has(id)).length;
  const citationValidity = markers.length === 0 ? (input.requireCitations ? 0 : 1) : valid / markers.length;
  if (citationValidity < 1) issues.push("citations");
  const artifacts = detectArtifacts(text);
  if (artifacts.rate > 0.1) issues.push("artifacts");
  const words = text.replace(/\[\d+\]/g, "").split(/\s+/).filter(Boolean).length;
  if (words > WORD_BUDGET[input.plan.mode]) issues.push("concision");
  const asked = new Set(contentWords(input.query));
  const stem = (word: string) => word.replace(/(ing|ed|es|s)$/, "");
  const answered = new Set(contentWords(text).map(stem));
  const overlap = [...asked].filter((word) => answered.has(stem(word))).length;
  const relevance = asked.size === 0 ? 1 : overlap / asked.size;
  const narrow = input.plan.mode === "specific_answer" || input.plan.mode === "fact";
  if (narrow && relevance < 0.25) issues.push("relevance");
  return { ok: issues.length === 0, issues, citationValidity, artifactRate: artifacts.rate, words, relevance };
}

export const HONEST_FAILURE =
  "Atlas couldn't produce a reliable answer from this document. Try a more specific question, or ask about a section or page.";

export const SCANNED_DOCUMENT =
  "This PDF looks like a scanned or image-only document, so there is almost no text Atlas can read. Atlas does not run OCR, so it can't answer from these pages.";
