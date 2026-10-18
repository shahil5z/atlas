import type { ZodType } from "zod";
import type { AgentEvent, AgentRole, ResearchRunMetrics } from "@/lib/agents/types";
import type { TraceSpan } from "@/lib/observability/trace";

export interface AgentResult<Output> {
  output: Output | null;
  events: AgentEvent[];
  metrics: Partial<ResearchRunMetrics>;
  spans: TraceSpan[];
  status: "completed" | "failed" | "cancelled";
  errors: string[];
  citationIds: string[];
}

export interface AgentContract<Input, Output> {
  id: string;
  role: AgentRole;
  description: string;
  objective: string;
  inputSchema: ZodType<Input>;
  outputSchema: ZodType<Output>;
  tools: readonly string[];
  promptId: string;
  constraints: readonly string[];
}

/**
 * A specialist is a validated role. The orchestrator is what actually runs it.
 * Agents share one local model. They are not separate processes.
 */
export interface Agent<Input, Output> {
  readonly id: string;
  readonly description: string;
  readonly contract: AgentContract<Input, Output>;
  run(input: Input, context: { signal: AbortSignal }): Promise<AgentResult<Output>>;
}
