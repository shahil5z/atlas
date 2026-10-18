import type { Citation } from "@/lib/retrieval/citations";
import type { AnalysisOutput, CriticOutput, PlannerOutput, ResearchOutput } from "@/lib/agents/schemas";

export const AGENT_ROLES = ["planner", "researcher", "analyst", "critic", "synthesizer"] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

export type AgentEventType =
  | "run_started"
  | "planning_started"
  | "planning_completed"
  | "retrieval_started"
  | "retrieval_completed"
  | "analysis_started"
  | "analysis_completed"
  | "critique_started"
  | "critique_completed"
  | "additional_research_requested"
  | "synthesis_started"
  | "synthesis_completed"
  | "run_completed"
  | "run_failed"
  | "run_cancelled";

export interface AgentEvent {
  id: string;
  timestamp: number;
  type: AgentEventType;
  agent: AgentRole | "orchestrator";
  message: string;
  promptId?: string;
}

export type TerminationReason = "sufficient" | "iteration_limit" | "no_document" | "cancelled";

export interface ResearchRunMetrics {
  totalMs: number | null;
  modelInitMs: number | null;
  planningMs: number | null;
  retrievalMs: number | null;
  analysisMs: number | null;
  critiqueMs: number | null;
  synthesisMs: number | null;
  iterations: number;
  toolCalls: number;
  generatedTokens: number | null;
  /** Null when the engine does not report a first streamed token. */
  firstTokenMs: number | null;
  retrievedChunks: number;
  /** Approximate prompt tokens from the character budget. Null when a run did not record one. */
  contextTokenEstimate: number | null;
}

export interface AnswerTable {
  caption?: string;
  headers: string[];
  rows: string[][];
}

export interface AnswerSection {
  heading: string;
  paragraphs: string[];
  bullets: string[];
  table?: AnswerTable;
}

export interface StructuredAnswer {
  overview: string;
  /** Answer mode chosen from the question intent (see lib/answer/answer-plan). */
  mode?: string;
  sections: AnswerSection[];
}

export interface ResearchAnswer {
  answer: string;
  keyFindings: string[];
  recommendations: string[];
  caveats: string[];
  citations: Citation[];
  knowledgeSource: "document" | "model";
  termination: TerminationReason;
  structured?: StructuredAnswer;
  /** Set when OpenAI wrote the answer. Absent on the local path. */
  provider?: "openai" | "local";
}

export interface AgentRun {
  runId: string;
  query: string;
  status: "running" | "completed" | "cancelled" | "failed";
  currentAgent: AgentRole | "orchestrator" | null;
  iteration: number;
  startedAt: number;
  completedAt: number | null;
  events: AgentEvent[];
  plan: PlannerOutput | null;
  findings: ResearchOutput | null;
  analysis: AnalysisOutput | null;
  critique: CriticOutput | null;
  answer: ResearchAnswer | null;
  metrics: ResearchRunMetrics;
  spans: import("@/lib/observability/trace").TraceSpan[];
}

export interface LanguageModel {
  generate(input: {
    system: string;
    user: string;
    maxNewTokens: number;
    temperature: number;
    doSample: boolean;
    signal: AbortSignal;
  }): Promise<{ text: string; tokenCount: number | null }>;
}
