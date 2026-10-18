export type QuestionIntent =
  | "document_overview"
  | "document_summary"
  | "key_points"
  | "topics"
  | "conclusions"
  | "comparison"
  | "structured_extraction"
  | "recommendation"
  | "page"
  | "fact_lookup"
  | "specific_question"
  | "general";

/** Back-compat aliases for older call sites. */
export type LegacyIntent = "overview" | "summary" | "extraction" | "lookup";

const DOC_REF = /\b(this|the|my|attached)\s+(pdf|document|doc|file|paper|plan|roadmap|report|resume|cv|contract|invoice|manual)\b/;

/**
 * Heuristic intent. The intent decides the answer format: overview questions get
 * a document overview, narrow questions get narrow answers.
 */
export function classifyIntent(query: string): QuestionIntent {
  const text = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (text.length === 0) return "general";
  if (/\bpage\s+\d+\b/.test(text)) return "page";
  if (/\b(compare|comparison|versus|vs\.?|difference between)\b/.test(text)) return "comparison";
  if (/\b(total|amount due|balance due|invoice number|due date)\b/.test(text)) return "structured_extraction";
  if (/\b(list|extract|table of|enumerate)\b/.test(text) && !/\bsummar/.test(text)) {
    if (/\b(priorit|most important|highest|first|should i)\b/.test(text)) return "recommendation";
    return "structured_extraction";
  }
  if (/\b(what should i (study|focus|do|prioriti[sz]e|revise)|recommend|which .* first|highest priority|most important|prioriti[sz]e|where (do|should) i start)\b/.test(text)) {
    return "recommendation";
  }
  if (/\b(what is this|what's this|what does this (pdf|document|file|paper) (say|cover|contain|do)|explain this|overview|what is the (pdf|document|file)( about)?|tell me about this|describe this)\b/.test(text)) {
    return "document_overview";
  }
  if (DOC_REF.test(text) && /\b(about|contain|cover|explain|describe)\b/.test(text)) return "document_overview";
  if (/\bsummar|\btl;?dr\b|\bgist\b/.test(text)) return "document_summary";
  if (/\b(key points|main points|key takeaways|highlights)\b/.test(text)) return "key_points";
  if (/\b(topics?|subjects?|chapters?|sections?)\b/.test(text) && /\b(what|which|list|main|all)\b/.test(text)) return "topics";
  if (/\b(conclusions?|main findings|results?|findings)\b/.test(text)) return "conclusions";
  if (/^(when|who|how many|how much|what (day|date|year|time|number|percentage))\b/.test(text) || /\b(which day|what day|on which)\b/.test(text)) return "fact_lookup";
  if (/\b(find|mention|where|who|which|what is the|what are the|how does|how do|how long|how often|why)\b/.test(text)) return "specific_question";
  return "general";
}

/** Intents the deterministic document composer can answer without the model. */
export function answersFromDocument(intent: QuestionIntent): boolean {
  return intent !== "general";
}

export function isOverviewIntent(intent: QuestionIntent): boolean {
  return intent === "document_overview" || intent === "document_summary" || intent === "key_points";
}
