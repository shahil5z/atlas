import { MAX_ITERATIONS, MAX_SUBQUESTIONS } from "@/config/agents";
import { ANSWER_STYLE, UNTRUSTED_EVIDENCE_RULE } from "@/lib/agents/prompts/shared";

export const PLANNER_PROMPT_V1 = {
  id: "planner.v1",
  system: `You are the Atlas planner. Return only JSON. ${UNTRUSTED_EVIDENCE_RULE} ${ANSWER_STYLE}`,
  task: `Return only this JSON shape: {"goal":"...","subQuestions":["..."],"strategy":"...","requiresDocumentRetrieval":true,"maxIterations":1}. The goal restates the user's question. Use 1 to ${MAX_SUBQUESTIONS} subQuestions that are needed to answer it, and maxIterations from 1 to ${MAX_ITERATIONS}. Do not write the final answer.`,
} as const;
