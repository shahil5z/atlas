import type { ResearchAnswer } from "@/lib/agents/types";
import { HONEST_FAILURE, WORD_BUDGET, answerPlanSchema, checkAnswerQuality, type AnswerMode } from "@/lib/answer/answer-plan";
import { cleanSentences, detectArtifacts } from "@/lib/documents/clean-text";
import { classifyIntent, type QuestionIntent } from "@/lib/documents/intent";

export function modeForIntent(intent: QuestionIntent, hasDocument: boolean): AnswerMode {
  if (!hasDocument) return "model_knowledge";
  switch (intent) {
    case "document_overview":
      return "document_overview";
    case "document_summary":
    case "key_points":
    case "conclusions":
      return "document_summary";
    case "fact_lookup":
      return "fact";
    case "topics":
      return "list";
    case "comparison":
      return "comparison";
    case "structured_extraction":
      return "extraction";
    case "recommendation":
      return "recommendation";
    case "page":
      return "page_summary";
    default:
      return "specific_answer";
  }
}

/** One bounded deterministic repair: keep clean, cited sentences within the mode's budget. */
function repairText(text: string, mode: AnswerMode, valid: ReadonlySet<number>): string {
  const budget = WORD_BUDGET[mode];
  const kept: string[] = [];
  let words = 0;
  for (const block of text.split(/\n{2,}/)) {
    const labels = [...block.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1])).filter((id) => valid.has(id));
    const body = block.replace(/\[\d+\]/g, " ");
    const sentences = cleanSentences(body);
    if (sentences.length === 0) continue;
    const chosen: string[] = [];
    for (const sentence of sentences) {
      const count = sentence.split(/\s+/).length;
      if (words + count > budget) break;
      chosen.push(sentence);
      words += count;
    }
    if (chosen.length === 0) break;
    const suffix = [...new Set(labels)].map((id) => `[${id}]`).join("");
    kept.push(`${chosen.join(" ")}${suffix ? ` ${suffix}` : ""}`);
    if (words >= budget) break;
  }
  return kept.join("\n\n");
}

/**
 * Quality gate for model-written answers. Passes good answers through, repairs
 * once, and otherwise returns null so the caller can fall back to a
 * deterministic answer or the honest failure message.
 */
export function gateModelAnswer(answer: ResearchAnswer, query: string, hasDocument: boolean): ResearchAnswer | null {
  const mode = modeForIntent(classifyIntent(query), hasDocument);
  if (!hasDocument || answer.knowledgeSource === "model") {
    // No document: never show document-style citation markers.
    const text = answer.answer.replace(/\s*\[\d+\]/g, "").trim();
    return text ? { ...answer, answer: text, citations: [] } : null;
  }
  const valid = new Set(answer.citations.map((citation) => citation.id));
  const check = (text: string) => {
    const plan = answerPlanSchema.safeParse({ mode, summary: text.slice(0, 1200) || " ", sections: [] });
    if (!plan.success) return null;
    return checkAnswerQuality({ plan: plan.data, query, validLabels: valid, requireCitations: valid.size === 0 });
  };
  const first = check(answer.answer);
  if (first?.ok && answer.answer.length <= 1200) return answer;
  const repaired = repairText(answer.answer, mode, valid);
  if (!repaired) return null;
  const second = check(repaired);
  if (!second || second.citationValidity < 1 || second.artifactRate > 0.1 || detectArtifacts(repaired).rate > 0.1) return null;
  if ((mode === "specific_answer" || mode === "fact") && second.relevance < 0.25) return null;
  const used = new Set([...repaired.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1])));
  return { ...answer, answer: repaired, citations: answer.citations.filter((citation) => used.has(citation.id)) };
}

export function honestFailure(answer: ResearchAnswer): ResearchAnswer {
  return { ...answer, answer: HONEST_FAILURE, keyFindings: [], recommendations: [], citations: [], caveats: [], structured: undefined };
}
