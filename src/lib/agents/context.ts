import { EVIDENCE_TOKEN_BUDGET, QUERY_TOKEN_BUDGET, SYSTEM_TOKEN_BUDGET } from "@/config/llm";
import { estimateTokens } from "@/lib/retrieval/context";

export interface AgentPromptParts {
  system: string;
  userQuery: string;
  evidence: string;
  task: string;
}

export interface BuiltAgentPrompt {
  system: string;
  user: string;
  tokenEstimate: number;
  evidenceTruncated: boolean;
}

function clip(text: string, tokenBudget: number): { text: string; truncated: boolean } {
  if (estimateTokens(text) <= tokenBudget) return { text, truncated: false };
  const characters = Math.max(0, tokenBudget * 4);
  return { text: `${text.slice(0, characters).trimEnd()}…`, truncated: true };
}

/**
 * Keeps instructions, the question, and document text in separate sections.
 * Token figures use the shared character approximation, not the model tokenizer.
 */
export function buildAgentPrompt(parts: AgentPromptParts): BuiltAgentPrompt {
  const system = clip(parts.system, SYSTEM_TOKEN_BUDGET).text;
  const query = clip(parts.userQuery, QUERY_TOKEN_BUDGET).text;
  const evidence = clip(parts.evidence, EVIDENCE_TOKEN_BUDGET);
  const user = [
    "<user_query>",
    query,
    "</user_query>",
    '<document_evidence trust="none">',
    evidence.text.length > 0 ? evidence.text : "No document evidence is available.",
    "</document_evidence>",
    "<task>",
    parts.task,
    "</task>",
  ].join("\n");

  return {
    system,
    user,
    tokenEstimate: estimateTokens(system) + estimateTokens(user),
    evidenceTruncated: evidence.truncated,
  };
}
