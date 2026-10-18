import { MAX_ITERATIONS, MAX_SUBQUESTIONS, MAX_TOOL_CALLS_PER_AGENT } from "@/config/agents";
import {
  analysisSchema,
  criticSchema,
  plannerSchema,
  researchSchema,
  synthesisSchema,
} from "@/lib/agents/schemas";
import { ANALYST_PROMPT_V1 } from "@/lib/agents/prompts/analyst";
import { CRITIC_PROMPT_V1 } from "@/lib/agents/prompts/critic";
import { PLANNER_PROMPT_V1 } from "@/lib/agents/prompts/planner";
import { RESEARCHER_PROMPT_V1 } from "@/lib/agents/prompts/researcher";
import { SYNTHESIZER_PROMPT_V1 } from "@/lib/agents/prompts/synthesizer";
import type { AgentContract } from "@/lib/agents/contract";
import { z } from "zod";

const queryInput = z.object({
  query: z.string().min(1),
  hasDocument: z.boolean(),
});

export const PLANNER_CONTRACT: AgentContract<z.infer<typeof queryInput>, z.infer<typeof plannerSchema>> = {
  id: "planner",
  role: "planner",
  description: "Turns the question into a bounded research plan.",
  objective: "Produce at most a few sub-questions and a retrieval decision.",
  inputSchema: queryInput,
  outputSchema: plannerSchema,
  tools: [],
  promptId: PLANNER_PROMPT_V1.id,
  constraints: [`At most ${MAX_SUBQUESTIONS} sub-questions.`, `At most ${MAX_ITERATIONS} iterations.`],
};

export const RESEARCHER_CONTRACT: AgentContract<z.infer<typeof queryInput>, z.infer<typeof researchSchema>> = {
  id: "researcher",
  role: "researcher",
  description: "Gathers document evidence or records model-knowledge findings.",
  objective: "Return findings tied to retrieved chunk ids when a document exists.",
  inputSchema: queryInput,
  outputSchema: researchSchema,
  tools: ["retrieveEvidence", "getDocumentMetadata", "getDocumentExcerpt"],
  promptId: RESEARCHER_PROMPT_V1.id,
  constraints: [`At most ${MAX_TOOL_CALLS_PER_AGENT} tool calls.`, "No web search.", "No code execution."],
};

export const ANALYST_CONTRACT: AgentContract<z.infer<typeof queryInput>, z.infer<typeof analysisSchema>> = {
  id: "analyst",
  role: "analyst",
  description: "Connects claims to evidence and marks inference.",
  objective: "Analyze findings. Do not write the final answer.",
  inputSchema: queryInput,
  outputSchema: analysisSchema,
  tools: [],
  promptId: ANALYST_PROMPT_V1.id,
  constraints: ["Claims must name their support type."],
};

export const CRITIC_CONTRACT: AgentContract<z.infer<typeof queryInput>, z.infer<typeof criticSchema>> = {
  id: "critic",
  role: "critic",
  description: "Checks whether the evidence supports another retrieval pass.",
  objective: "Flag unsupported claims and decide whether to continue.",
  inputSchema: queryInput,
  outputSchema: criticSchema,
  tools: [],
  promptId: CRITIC_PROMPT_V1.id,
  constraints: [`Continuation cannot exceed ${MAX_ITERATIONS} iterations.`],
};

export const SYNTHESIZER_CONTRACT: AgentContract<z.infer<typeof queryInput>, z.infer<typeof synthesisSchema>> = {
  id: "synthesizer",
  role: "synthesizer",
  description: "Writes the user-facing answer from the research state.",
  objective: "Answer the question and cite only retrieved chunks.",
  inputSchema: queryInput,
  outputSchema: synthesisSchema,
  tools: [],
  promptId: SYNTHESIZER_PROMPT_V1.id,
  constraints: ["Do not invent citations or URLs."],
};

export const SPECIALIST_CONTRACTS = [
  PLANNER_CONTRACT,
  RESEARCHER_CONTRACT,
  ANALYST_CONTRACT,
  CRITIC_CONTRACT,
  SYNTHESIZER_CONTRACT,
] as const;

export type GraphWhen = "always" | "insufficient_evidence" | "sufficient_or_limit";

export interface AgentEdge {
  from: string;
  to: string;
  when: GraphWhen;
}

export interface AgentGraph {
  id: string;
  version: string;
  nodes: readonly string[];
  edges: readonly AgentEdge[];
}

/** Internal execution graph. There is no visual editor. */
export const ATLAS_AGENT_GRAPH: AgentGraph = {
  id: "atlas-research",
  version: "v1",
  nodes: SPECIALIST_CONTRACTS.map((contract) => contract.id),
  edges: [
    { from: "planner", to: "researcher", when: "always" },
    { from: "researcher", to: "analyst", when: "always" },
    { from: "analyst", to: "critic", when: "always" },
    { from: "critic", to: "researcher", when: "insufficient_evidence" },
    { from: "critic", to: "synthesizer", when: "sufficient_or_limit" },
  ],
};

export function nextAgents(graph: AgentGraph, nodeId: string, when: GraphWhen): string[] {
  return graph.edges.filter((edge) => edge.from === nodeId && (edge.when === when || edge.when === "always")).map((edge) => edge.to);
}
