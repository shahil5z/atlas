import { chunkDocument } from "@/lib/chunking/chunk-document";
import { detectArtifacts } from "@/lib/documents/clean-text";
import { pagesFromChunks, profileDocument, type DocumentKind } from "@/lib/documents/profile";
import { WORD_BUDGET } from "@/lib/answer/answer-plan";
import studyPlanPages from "@/test-fixtures/study-plan.pages.json";
import mistralPages from "@/test-fixtures/mistral7b.pages.json";

import { composeDocumentAnswer } from "@/lib/documents/compose-answer";
import type { EvaluationFailure } from "@/lib/evaluation/failures";
import type { DocumentChunk } from "@/types/documents";

export const DOCUMENT_DATASET_VERSION = "documents-v1";

interface DocumentCase {
  id: string;
  query: string;
  pages: { page: number; text: string }[];
  mustInclude: string[];
  mustExclude: string[];
  page?: number;
}

const CASES: DocumentCase[] = [
  {
    id: "roadmap-overview",
    query: "What is this PDF about?",
    pages: [
      { page: 1, text: "CIL MT System\nProfessional 20 Day Roadmap\nDaily routine: 5-6 hours of study." },
      { page: 2, text: "Day 1\nHard Topic • DBMS\nEasy Topic • Operating System" },
      { page: 3, text: "Priority 1: DBMS and Operating System" },
    ],
    mustInclude: ["study roadmap", "20-day", "dbms"],
    mustExclude: ["hard topic •"],
  },
  {
    id: "paper-findings",
    query: "What are the main findings?",
    pages: [
      { page: 1, text: "Local Retrieval\nAbstract\nThis paper studies whether a browser can answer questions from a private PDF." },
      { page: 2, text: "Conclusion\nThe study finds that structure-aware summaries are more useful than raw chunk lists for overview questions." },
    ],
    mustInclude: ["structure-aware"],
    mustExclude: ["ignore previous"],
  },
];

function toChunks(pages: { page: number; text: string }[]): DocumentChunk[] {
  return pages.map((page) => ({
    chunkId: `p${page.page}`,
    documentId: "eval",
    pageNumber: page.page,
    text: page.text,
    characterStart: 0,
    characterEnd: page.text.length,
  }));
}

export function evaluateDocuments(): { version: string; cases: number; failures: EvaluationFailure[] } {
  const failures: EvaluationFailure[] = [];
  for (const testCase of CASES) {
    const composed = composeDocumentAnswer({
      query: testCase.query,
      document: { id: "eval", name: "fixture.pdf", pageCount: testCase.pages.length },
      chunks: toChunks(testCase.pages),
    });
    const answer = composed?.answer.answer.toLowerCase() ?? "";
    const missing = testCase.mustInclude.find((phrase) => !answer.includes(phrase));
    const forbidden = testCase.mustExclude.find((phrase) => answer.includes(phrase));
    if (!composed || missing || forbidden) {
      failures.push({
        caseId: testCase.id,
        category: "agent",
        expected: missing ? `include ${missing}` : `exclude ${forbidden}`,
        actual: answer.slice(0, 180) || "no answer",
        severity: "high",
        metadata: {},
      });
    }
  }
  return { version: DOCUMENT_DATASET_VERSION, cases: CASES.length, failures };
}

/* ------------------------------------------------------------------ quality */

export const DOCUMENT_QUALITY_DATASET_VERSION = "document-quality-v1";

interface QualityCase {
  id: string;
  query: string;
  pages: { pageNumber: number; text: string }[];
  type: DocumentKind;
  mustMatch: RegExp[];
  mustNotMatch: RegExp[];
}

const QUALITY_CASES: QualityCase[] = [
  {
    id: "study-plan-overview",
    query: "What is this PDF about?",
    pages: studyPlanPages,
    type: "study_plan",
    mustMatch: [/study roadmap/i, /20-day/, /DBMS/, /Operating System/, /Computer Networks/, /revision priorit/i],
    mustNotMatch: [/Hard Topic/, /•/, /Memory Management[\s,]+Paging/],
  },
  {
    id: "paper-overview",
    query: "What is this PDF about?",
    pages: mistralPages,
    type: "research_paper",
    mustMatch: [/^This research paper/, /language model/i, /outperforms/],
    mustNotMatch: [/^Abstract/, /Albert Q\. Jiang/, /https?:\/\//],
  },
  {
    id: "resume-overview",
    query: "What is this PDF about?",
    pages: [{ pageNumber: 1, text: "Priya Nair\nSummary\nFrontend engineer.\nExperience\nSenior Engineer, Northwind\nEducation\nB.Tech Computer Science\nSkills\nTypeScript, React\nProjects\nPDF reader" }],
    type: "resume",
    mustMatch: [/resume of Priya Nair/, /experience/i],
    mustNotMatch: [/@/],
  },
  {
    id: "tech-doc-overview",
    query: "What is this PDF about?",
    pages: [
      { pageNumber: 1, text: "Atlas Sync API\nOverview\nThe Atlas Sync API lets a client upload configuration and read back device state.\nAuthentication\nEvery request must include a session parameter.\nEndpoints\nGET /devices returns the list of devices with their configuration." },
      { pageNumber: 2, text: "Errors\nThe API returns a JSON error object.\nArchitecture\nRequests pass through a gateway before reaching the configuration service." },
    ],
    type: "technical_doc",
    mustMatch: [/technical document/, /upload configuration/],
    mustNotMatch: [/•/],
  },
  {
    id: "invoice-overview",
    query: "What is this PDF about?",
    pages: [{ pageNumber: 1, text: "INVOICE\nInvoice number: INV-2041\nBill to: Northwind Traders\nQty 2 Widgets\nSubtotal $40.00\nAmount due $42.50" }],
    type: "invoice",
    mustMatch: [/invoice/i, /\$42\.50/],
    mustNotMatch: [/due date/i],
  },
];

export interface DocumentQualityEvaluation {
  version: string;
  metrics: {
    overview_quality: number;
    citation_validity: number;
    artifact_rate: number;
    document_type_accuracy: number;
    answer_concision: number;
  };
  failures: EvaluationFailure[];
}

/** Thresholds for the deterministic document path. New metrics; existing thresholds are untouched. */
export const DOCUMENT_QUALITY_THRESHOLDS = {
  overview_quality: 0.9,
  citation_validity: 1,
  artifact_rate: 0.1,
  document_type_accuracy: 0.8,
  answer_concision: 1,
} as const;

export function evaluateDocumentQuality(): DocumentQualityEvaluation {
  const failures: EvaluationFailure[] = [];
  let quality = 0;
  let validity = 0;
  let artifacts = 0;
  let typed = 0;
  let concise = 0;
  for (const testCase of QUALITY_CASES) {
    const document = { id: testCase.id, name: `${testCase.id}.pdf`, size: 1, pageCount: testCase.pages.length, createdAt: 0, pages: testCase.pages };
    const chunks = chunkDocument(document);
    const profile = profileDocument(pagesFromChunks(chunks), document.pageCount);
    if (profile.estimatedDocumentType === testCase.type) typed += 1;
    const composed = composeDocumentAnswer({ query: testCase.query, document, chunks });
    const text = composed?.answer.answer ?? "";
    const summary = composed?.structured.overview ?? "";
    const checks = [
      ...testCase.mustMatch.map((pattern) => pattern.test(pattern.source.startsWith("^") ? summary : text)),
      ...testCase.mustNotMatch.map((pattern) => !pattern.test(pattern.source.startsWith("^") ? summary : text)),
    ];
    const score = composed ? checks.filter(Boolean).length / checks.length : 0;
    quality += score;
    const ids = new Set(composed?.answer.citations.map((citation) => citation.id) ?? []);
    const markers = [...text.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1]));
    const pageOk = (composed?.answer.citations ?? []).every((citation) => chunks.find((chunk) => chunk.chunkId === citation.chunkId)?.pageNumber === citation.pageNumber);
    validity += markers.length > 0 && markers.every((id) => ids.has(id)) && pageOk ? 1 : 0;
    artifacts += detectArtifacts(text).rate;
    const words = text.replace(/\[\d+\]/g, "").split(/\s+/).filter(Boolean).length;
    concise += composed && words <= WORD_BUDGET[composed.plan.mode] ? 1 : 0;
    if (score < 1) {
      failures.push({ caseId: testCase.id, category: "agent", expected: "all overview properties", actual: text.slice(0, 180) || "no answer", severity: "high", metadata: {} });
    }
  }
  const total = QUALITY_CASES.length;
  const metrics = {
    overview_quality: quality / total,
    citation_validity: validity / total,
    artifact_rate: artifacts / total,
    document_type_accuracy: typed / total,
    answer_concision: concise / total,
  };
  const below = (name: keyof typeof metrics, ok: boolean) => {
    if (!ok) failures.push({ caseId: `metric:${name}`, category: "agent", expected: String(DOCUMENT_QUALITY_THRESHOLDS[name]), actual: metrics[name].toFixed(3), severity: "high", metadata: {} });
  };
  below("overview_quality", metrics.overview_quality >= DOCUMENT_QUALITY_THRESHOLDS.overview_quality);
  below("citation_validity", metrics.citation_validity >= DOCUMENT_QUALITY_THRESHOLDS.citation_validity);
  below("artifact_rate", metrics.artifact_rate <= DOCUMENT_QUALITY_THRESHOLDS.artifact_rate);
  below("document_type_accuracy", metrics.document_type_accuracy >= DOCUMENT_QUALITY_THRESHOLDS.document_type_accuracy);
  below("answer_concision", metrics.answer_concision >= DOCUMENT_QUALITY_THRESHOLDS.answer_concision);
  return { version: DOCUMENT_QUALITY_DATASET_VERSION, metrics, failures };
}
