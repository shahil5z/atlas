import { EMBEDDING_MODEL_ID } from "@/config/embedding";
import { LOCAL_LLM_CONFIG } from "@/config/llm";
import { CITATION_CASES_V1, CITATION_DATASET_VERSION } from "../../../evaluation/datasets/citations-v1";
import { evaluateAgents } from "@/lib/evaluation/agent-eval";
import { evaluateDocumentQuality, evaluateDocuments } from "@/lib/evaluation/document-eval";
import { evaluateCitations } from "@/lib/evaluation/citation-eval";
import type { EvaluationFailure } from "@/lib/evaluation/failures";
import { evaluateRetrievalVariant, retrievalDelta, retrievalFailures, type RetrievalVariantResult } from "@/lib/evaluation/retrieval-eval";
import { evaluateStructuredOutput, type StructuredEvaluation } from "@/lib/evaluation/structured-eval";
import type { AgentEvaluation } from "@/lib/evaluation/agent-eval";
import type { CitationEvaluation } from "@/lib/evaluation/citation-eval";

export const EVALUATOR_VERSION = "eval-v1";

export interface EvaluationReport {
  evaluatorVersion: string;
  datasetVersion: string;
  modelId: string;
  embeddingModelId: string;
  metrics: Record<string, number | null>;
  failures: EvaluationFailure[];
  timings: Record<string, number | null>;
  createdAt: string;
}

export interface AtlasEvaluation {
  reports: EvaluationReport[];
  retrieval: Record<"semantic" | "hybrid" | "hybrid-mmr", RetrievalVariantResult>;
  citations: CitationEvaluation;
  structured: StructuredEvaluation;
  agents: AgentEvaluation;
}

export async function runAtlasEvaluation(sections: readonly ("retrieval" | "citations" | "agents" | "structured")[] = [
  "retrieval",
  "citations",
  "agents",
  "structured",
]): Promise<AtlasEvaluation> {
  const retrieval = {
    semantic: evaluateRetrievalVariant("semantic"),
    hybrid: evaluateRetrievalVariant("hybrid"),
    "hybrid-mmr": evaluateRetrievalVariant("hybrid-mmr"),
  };
  const citations = evaluateCitations(CITATION_DATASET_VERSION, CITATION_CASES_V1);
  const structured = sections.includes("structured") ? await evaluateStructuredOutput() : emptyStructured();
  const agents = sections.includes("agents") ? await evaluateAgents() : emptyAgents();
  const createdAt = new Date().toISOString();
  const reports: EvaluationReport[] = [];

  if (sections.includes("retrieval")) {
    reports.push({
      evaluatorVersion: EVALUATOR_VERSION,
      datasetVersion: "retrieval-v1",
      modelId: LOCAL_LLM_CONFIG.modelId,
      embeddingModelId: EMBEDDING_MODEL_ID,
      metrics: {
        recallAt1: retrieval.hybrid.recallAt1,
        recallAt3: retrieval.hybrid.recallAt3,
        recallAt5: retrieval.hybrid.recallAt5,
        precisionAt5: retrieval.hybrid.precisionAt5,
        mrr: retrieval.hybrid.mrr,
        ndcgAt5: retrieval.hybrid.ndcgAt5,
        semanticRecallAt5: retrieval.semantic.recallAt5,
        mmrRecallAt5: retrieval["hybrid-mmr"].recallAt5,
        rerankDeltaRecallAt5: retrievalDelta(retrieval.hybrid, retrieval["hybrid-mmr"]),
        lexicalDeltaRecallAt5: retrievalDelta(retrieval.semantic, retrieval.hybrid),
      },
      failures: retrievalFailures(retrieval.hybrid, 0),
      timings: {
        hybridMs: retrieval.hybrid.latencyMs,
        semanticMs: retrieval.semantic.latencyMs,
        mmrMs: retrieval["hybrid-mmr"].latencyMs,
      },
      createdAt,
    });
  }

  if (sections.includes("citations")) {
    reports.push({
      evaluatorVersion: EVALUATOR_VERSION,
      datasetVersion: CITATION_DATASET_VERSION,
      modelId: LOCAL_LLM_CONFIG.modelId,
      embeddingModelId: EMBEDDING_MODEL_ID,
      metrics: {
        citationValidity: citations.citationValidity,
        invalidCitationRate: citations.invalidCitationRate,
        citationCoverage: citations.citationCoverage,
      },
      failures: citations.failures,
      timings: {},
      createdAt,
    });
  }

  if (sections.includes("structured")) {
    reports.push({
      evaluatorVersion: EVALUATOR_VERSION,
      datasetVersion: structured.version,
      modelId: LOCAL_LLM_CONFIG.modelId,
      embeddingModelId: EMBEDDING_MODEL_ID,
      metrics: {
        successRate: structured.successRate,
        failureRate: structured.failureRate,
        repairRate: structured.repairRate,
        retryRecoveryRate: structured.retryRecoveryRate,
      },
      failures: structured.failures,
      timings: {},
      createdAt,
    });
  }

  if (sections.includes("agents")) {
    reports.push({
      evaluatorVersion: EVALUATOR_VERSION,
      datasetVersion: agents.version,
      modelId: LOCAL_LLM_CONFIG.modelId,
      embeddingModelId: EMBEDDING_MODEL_ID,
      metrics: {
        completionRate: agents.completionRate,
        terminationRate: agents.terminationRate,
        failureRate: agents.failureRate,
        cancellationRate: agents.cancellationRate,
        averageIterations: agents.averageIterations,
        averageToolCalls: agents.averageToolCalls,
        criticDetectedUnsupported: agents.criticDetectedUnsupported ? 1 : 0,
      },
      failures: agents.failures,
      timings: {},
      createdAt,
    });
  }

  const documents = evaluateDocuments();
  reports.push({
    evaluatorVersion: EVALUATOR_VERSION,
    datasetVersion: documents.version,
    modelId: LOCAL_LLM_CONFIG.modelId,
    embeddingModelId: EMBEDDING_MODEL_ID,
    metrics: { cases: documents.cases },
    failures: documents.failures,
    timings: {},
    createdAt,
  });

  const quality = evaluateDocumentQuality();
  reports.push({
    evaluatorVersion: EVALUATOR_VERSION,
    datasetVersion: quality.version,
    modelId: LOCAL_LLM_CONFIG.modelId,
    embeddingModelId: EMBEDDING_MODEL_ID,
    metrics: quality.metrics,
    failures: quality.failures,
    timings: {},
    createdAt,
  });

  return { reports, retrieval, citations, structured, agents };
}

function emptyStructured(): StructuredEvaluation {
  return {
    version: "structured-v1",
    cases: 0,
    successRate: 0,
    failureRate: 0,
    repairRate: 0,
    retryRecoveryRate: null,
    failures: [],
  };
}

function emptyAgents(): AgentEvaluation {
  return {
    version: "agents-v1",
    cases: 0,
    completionRate: 0,
    terminationRate: 0,
    failureRate: 0,
    cancellationRate: 0,
    averageIterations: 0,
    averageToolCalls: 0,
    criticDetectedUnsupported: false,
    scores: [],
    failures: [],
  };
}

export function formatReport(report: EvaluationReport): string {
  const lines = [
    "Atlas Evaluation",
    "",
    `Dataset: ${report.datasetVersion}`,
    `Embedding model: ${report.embeddingModelId}`,
    `Answer model config: ${report.modelId}`,
    "",
  ];
  for (const [name, value] of Object.entries(report.metrics)) {
    lines.push(`${name.padEnd(28)} ${value === null ? "null" : value.toFixed(3)}`);
  }
  lines.push("", `Failures: ${report.failures.length}`);
  for (const failure of report.failures) {
    lines.push(`- [${failure.severity}] ${failure.caseId}: expected ${failure.expected}, actual ${failure.actual}`);
  }
  return lines.join("\n");
}
