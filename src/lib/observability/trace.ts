import type { AgentEvent, ResearchRunMetrics } from "@/lib/agents/types";

export interface TraceSpan {
  id: string;
  parentId: string | null;
  name: string;
  startTime: number;
  endTime: number | null;
  status: "ok" | "error" | "cancelled";
  attributes: Record<string, string | number | boolean | null>;
}

const PAIRS: readonly [AgentEvent["type"], AgentEvent["type"], string, keyof ResearchRunMetrics][] = [
  ["planning_started", "planning_completed", "agent.planner", "planningMs"],
  ["retrieval_started", "retrieval_completed", "retrieval.query", "retrievalMs"],
  ["analysis_started", "analysis_completed", "agent.analyst", "analysisMs"],
  ["critique_started", "critique_completed", "agent.critic", "critiqueMs"],
  ["synthesis_started", "synthesis_completed", "agent.synthesizer", "synthesisMs"],
];

/**
 * Builds a local trace from orchestrator events.
 * Durations come from measured metrics. Missing timings stay null.
 * Event messages are the only text copied onto spans.
 */
export function buildTrace(
  events: readonly AgentEvent[],
  metrics: ResearchRunMetrics,
  status: "running" | "completed" | "cancelled" | "failed",
): TraceSpan[] {
  const spanStatus = status === "failed" ? "error" : status === "cancelled" ? "cancelled" : "ok";
  const root: TraceSpan = {
    id: "research.run",
    parentId: null,
    name: "research.run",
    startTime: events[0]?.timestamp ?? 0,
    endTime: events.at(-1)?.timestamp ?? null,
    status: spanStatus,
    attributes: {
      iterations: metrics.iterations,
      toolCalls: metrics.toolCalls,
      generatedTokens: metrics.generatedTokens,
      totalMs: metrics.totalMs,
      retrievedChunks: metrics.retrievedChunks,
      firstTokenMs: metrics.firstTokenMs,
      contextTokenEstimate: metrics.contextTokenEstimate,
    },
  };

  const children: TraceSpan[] = [];
  for (const [startType, endType, name, metricKey] of PAIRS) {
    const starts = events.filter((event) => event.type === startType);
    const ends = events.filter((event) => event.type === endType);
    starts.forEach((start, index) => {
      const end = ends[index];
      const duration = metrics[metricKey];
      children.push({
        id: `${name}:${index + 1}`,
        parentId: root.id,
        name,
        startTime: start.timestamp,
        endTime: end?.timestamp ?? null,
        status: end ? "ok" : spanStatus,
        attributes: {
          message: start.message,
          durationMs: typeof duration === "number" ? duration : null,
        },
      });
    });
  }

  return [root, ...children];
}
