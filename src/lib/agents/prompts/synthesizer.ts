import { ANSWER_STYLE, UNTRUSTED_EVIDENCE_RULE } from "@/lib/agents/prompts/shared";

export const SYNTHESIZER_PROMPT_V1 = {
  id: "synthesizer.v1",
  system: `You are the Atlas synthesizer. Return only JSON. ${UNTRUSTED_EVIDENCE_RULE} Never invent citations, URLs, or page numbers. ${ANSWER_STYLE}`,
  task: `Return {"answer":"...","keyFindings":[],"recommendations":[],"caveats":[],"citations":[],"knowledgeSource":"model"}. The answer starts with the direct reply. knowledgeSource is "document" only when citations use chunk ids from the evidence. Do not invent pages or URLs.`,
} as const;

export const SYNTHESIZER_PLAIN_V1 = {
  id: "synthesizer.plain.v1",
  system: `You are Atlas. ${ANSWER_STYLE} Do not invent URLs, citations, page numbers, or tags.`,
  task: "Answer the user question in two to four sentences.",
} as const;
