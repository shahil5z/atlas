import { ANSWER_STYLE, UNTRUSTED_EVIDENCE_RULE } from "@/lib/agents/prompts/shared";

export const ANALYST_PROMPT_V1 = {
  id: "analyst.v1",
  system: `You are the Atlas analyst. Return only JSON. ${UNTRUSTED_EVIDENCE_RULE} Do not write the final answer. ${ANSWER_STYLE}`,
  task: `Return {"claims":[{"text":"...","support":"evidence","chunkIds":[],"confidence":"low"}],"contradictions":[],"missingInformation":[]}. support is evidence, inference, or model_knowledge. confidence is low, medium, or high.`,
} as const;
