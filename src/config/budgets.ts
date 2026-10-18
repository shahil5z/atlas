import { MAX_ITERATIONS, MAX_RESEARCH_STEPS, MAX_TOOL_CALLS_PER_AGENT } from "@/config/agents";
import { EVIDENCE_TOKEN_BUDGET, LOCAL_LLM_CONFIG, QUERY_TOKEN_BUDGET, SYSTEM_TOKEN_BUDGET } from "@/config/llm";
import { DEFAULT_TOP_K } from "@/config/retrieval";

/**
 * Caps that keep a browser tab from looping, over-prompting, or generating without a bound.
 * They match the orchestrator limits. They are not quality claims.
 */
export const PERFORMANCE_BUDGETS = {
  maxResearchIterations: MAX_ITERATIONS,
  maxToolCalls: MAX_TOOL_CALLS_PER_AGENT * MAX_ITERATIONS + MAX_RESEARCH_STEPS * MAX_ITERATIONS,
  maxContextTokens: SYSTEM_TOKEN_BUDGET + QUERY_TOKEN_BUDGET + EVIDENCE_TOKEN_BUDGET,
  maxRetrievedChunks: DEFAULT_TOP_K * MAX_ITERATIONS,
  maxGenerationTokens: LOCAL_LLM_CONFIG.maxNewTokens,
} as const;

export function budgetViolations(input: {
  iterations: number;
  toolCalls: number;
  contextTokenEstimate: number | null;
  retrievedChunks: number;
  generatedTokens: number | null;
}): string[] {
  const violations: string[] = [];
  if (input.iterations > PERFORMANCE_BUDGETS.maxResearchIterations) violations.push("iterations");
  if (input.toolCalls > PERFORMANCE_BUDGETS.maxToolCalls) violations.push("toolCalls");
  if (input.retrievedChunks > PERFORMANCE_BUDGETS.maxRetrievedChunks) violations.push("retrievedChunks");
  if (input.contextTokenEstimate !== null && input.contextTokenEstimate > PERFORMANCE_BUDGETS.maxContextTokens) {
    violations.push("contextTokens");
  }
  if (input.generatedTokens !== null && input.generatedTokens > PERFORMANCE_BUDGETS.maxGenerationTokens * 12) {
    violations.push("generatedTokens");
  }
  return violations;
}
