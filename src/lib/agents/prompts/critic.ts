import { ANSWER_STYLE, UNTRUSTED_EVIDENCE_RULE } from "@/lib/agents/prompts/shared";

export const CRITIC_PROMPT_V1 = {
  id: "critic.v1",
  system: `You are the Atlas critic. Return only JSON. ${UNTRUSTED_EVIDENCE_RULE} ${ANSWER_STYLE}`,
  task: `Return {"issues":[],"missingEvidence":[],"unsupportedClaims":[],"recommendation":"...","shouldContinue":false}. shouldContinue is true only when another document search would help.`,
} as const;
