import { runResearch } from "@/lib/agents/orchestrator";
import { ResearchCancelled } from "@/lib/llm/cancelled";
import type { LanguageModel } from "@/lib/agents/types";
import type { EvaluationFailure } from "@/lib/evaluation/failures";
import { mean } from "@/lib/evaluation/formulas";
import type { RetrievalOutcome } from "@/lib/retrieval/types";
import type { DocumentChunk } from "@/types/documents";

export const AGENT_DATASET_VERSION = "agents-v1";

const chunk: DocumentChunk = {
  chunkId: "p2",
  documentId: "doc",
  pageNumber: 2,
  text: "Atlas uses semantic retrieval.",
  characterStart: 0,
  characterEnd: 32,
};

const outcome = {
  displayQuery: "evidence",
  retrievalQuery: "evidence",
  hits: [
    {
      rank: 1,
      score: 0.8,
      semanticScore: 0.8,
      lexicalScore: 0.2,
      chunkId: "p2",
      documentId: "doc",
      pageNumber: 2,
      citation: {
        id: 1,
        label: "[1]",
        documentId: "doc",
        documentName: "Notes.pdf",
        pageNumber: 2,
        chunkId: "p2",
      },
    },
  ],
  context: { sources: [], text: "", tokenEstimate: 0, truncated: false },
  generation: { system: "", userQuery: "evidence", retrievedDocumentContent: "" },
} satisfies RetrievalOutcome;

function model(replies: string[]): LanguageModel {
  const script = [...replies];
  return {
    async generate(input) {
      if (input.signal.aborted) throw new ResearchCancelled();
      const next = script.shift();
      if (!next) throw new Error("The scripted model ran out of replies.");
      if (next === "FAIL") throw new Error("model failed");
      return { text: next, tokenCount: 4 };
    },
  };
}

const plan = JSON.stringify({
  goal: "Explain the evidence",
  subQuestions: ["What does Atlas use?"],
  strategy: "Search the document",
  requiresDocumentRetrieval: true,
  maxIterations: 2,
});
const findings = JSON.stringify({
  findings: [{ statement: "Atlas uses semantic retrieval.", chunkIds: ["p2"], source: "document" }],
  unresolvedQuestions: [],
});
const analysis = JSON.stringify({
  claims: [{ text: "Atlas uses semantic retrieval.", support: "evidence", chunkIds: ["p2"], confidence: "high" }],
  contradictions: [],
  missingInformation: [],
});
const sufficient = JSON.stringify({
  issues: [],
  missingEvidence: [],
  unsupportedClaims: [],
  recommendation: "Enough evidence",
  shouldContinue: false,
});
const insufficient = JSON.stringify({
  issues: ["Thin evidence"],
  missingEvidence: ["database"],
  unsupportedClaims: ["A second claim"],
  recommendation: "Search once more",
  shouldContinue: true,
});
const synthesis = JSON.stringify({
  answer: "Atlas uses semantic retrieval [1].",
  keyFindings: ["Semantic retrieval"],
  recommendations: [],
  caveats: [],
  citations: [{ chunkId: "p2" }],
  knowledgeSource: "document",
});

const document = { id: "doc", name: "Notes.pdf", pageCount: 3, size: 20 };

export interface AgentScenarioScore {
  id: string;
  completed: boolean;
  cancelled: boolean;
  failed: boolean;
  iterations: number;
  toolCalls: number;
  eventTypes: string[];
}

export interface AgentEvaluation {
  version: string;
  cases: number;
  completionRate: number;
  terminationRate: number;
  failureRate: number;
  cancellationRate: number;
  averageIterations: number;
  averageToolCalls: number;
  criticDetectedUnsupported: boolean;
  scores: AgentScenarioScore[];
  failures: EvaluationFailure[];
}

async function scenario(
  id: string,
  replies: string[],
  options?: { abortAfter?: number; document?: typeof document | null; maxIterations?: number },
): Promise<AgentScenarioScore> {
  const controller = new AbortController();
  let calls = 0;
  const scripted = model(replies);
  const wrapped: LanguageModel = {
    async generate(input) {
      calls += 1;
      if (options?.abortAfter && calls >= options.abortAfter) controller.abort();
      return scripted.generate(input);
    },
  };
  try {
    const run = await runResearch({
      runId: id,
      query: "What does Atlas use?",
      document: options?.document === undefined ? document : options.document,
      chunks: options?.document === null ? [] : [chunk],
      model: wrapped,
      retrieve: async () => outcome,
      signal: controller.signal,
    });
    return {
      id,
      completed: run.status === "completed",
      cancelled: false,
      failed: false,
      iterations: run.metrics.iterations,
      toolCalls: run.metrics.toolCalls,
      eventTypes: run.events.map((event) => event.type),
    };
  } catch (error) {
    const cancelled = error instanceof ResearchCancelled;
    return {
      id,
      completed: false,
      cancelled,
      failed: !cancelled,
      iterations: 0,
      toolCalls: 0,
      eventTypes: cancelled ? ["run_cancelled"] : ["run_failed"],
    };
  }
}

export async function evaluateAgents(): Promise<AgentEvaluation> {
  const sufficientPlan = JSON.stringify({ ...JSON.parse(plan), maxIterations: 1 });
  const scores = await Promise.all([
    scenario("sufficient-immediately", [plan, findings, analysis, sufficient, synthesis]),
    scenario("insufficient-then-stop", [plan, findings, analysis, insufficient, findings, analysis, sufficient, synthesis]),
    scenario("iteration-limit", [
      JSON.stringify({ ...JSON.parse(plan), maxIterations: 1 }),
      findings,
      analysis,
      JSON.stringify({ ...JSON.parse(insufficient), shouldContinue: true }),
      synthesis,
    ]),
    scenario("model-failure", ["FAIL"]),
    scenario("cancelled", [plan, findings], { abortAfter: 2 }),
    scenario("no-document", [sufficientPlan, findings, analysis, sufficient, synthesis], { document: null }),
  ]);

  const finished = scores.filter((score) => score.completed);
  const critic = scores.find((score) => score.id === "insufficient-then-stop");
  const failures: EvaluationFailure[] = [];
  const expectCompleted = ["sufficient-immediately", "insufficient-then-stop", "iteration-limit", "no-document"];
  for (const id of expectCompleted) {
    if (!scores.find((score) => score.id === id)?.completed) {
      failures.push({
        caseId: id,
        category: "agent",
        expected: "completed",
        actual: "not completed",
        severity: "high",
        metadata: {},
      });
    }
  }
  if (!scores.find((score) => score.id === "model-failure")?.failed) {
    failures.push({
      caseId: "model-failure",
      category: "agent",
      expected: "controlled failure",
      actual: "did not fail",
      severity: "critical",
      metadata: {},
    });
  }
  if (!scores.find((score) => score.id === "cancelled")?.cancelled) {
    failures.push({
      caseId: "cancelled",
      category: "agent",
      expected: "cancelled",
      actual: "not cancelled",
      severity: "critical",
      metadata: {},
    });
  }
  if (!critic?.eventTypes.includes("additional_research_requested")) {
    failures.push({
      caseId: "insufficient-then-stop",
      category: "agent",
      expected: "second retrieval",
      actual: critic?.eventTypes.join(",") ?? "",
      severity: "high",
      metadata: {},
    });
  }

  return {
    version: AGENT_DATASET_VERSION,
    cases: scores.length,
    completionRate: scores.filter((score) => score.completed).length / scores.length,
    terminationRate: scores.filter((score) => score.completed || score.cancelled || score.failed).length / scores.length,
    failureRate: scores.filter((score) => score.failed).length / scores.length,
    cancellationRate: scores.filter((score) => score.cancelled).length / scores.length,
    averageIterations: mean(finished.map((score) => score.iterations)),
    averageToolCalls: mean(finished.map((score) => score.toolCalls)),
    criticDetectedUnsupported: Boolean(critic?.eventTypes.includes("additional_research_requested")),
    scores,
    failures,
  };
}
