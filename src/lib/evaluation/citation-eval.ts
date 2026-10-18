import type { EvidenceRef } from "@/lib/agents/citations";
import { validateAnswerCitations } from "@/lib/agents/citations";
import type { EvaluationFailure } from "@/lib/evaluation/failures";
import { mean } from "@/lib/evaluation/formulas";

export type ClaimSupport = "evidence" | "inference" | "model_knowledge";

export interface AnswerClaim {
  claim: string;
  citationIds: string[];
  type: ClaimSupport;
}

export interface CitationCase {
  id: string;
  answer: string;
  claimed: { chunkId: string }[];
  evidence: EvidenceRef[];
  claims: AnswerClaim[];
  /** keep: a real retrieved chunk must survive. reject: every claimed citation must be removed. */
  expect: "keep" | "reject" | "uncited";
}

export interface CitationCaseScore {
  id: string;
  validity: number;
  invalidRate: number;
  coverage: number | null;
  kept: number;
  removed: number;
}

export interface CitationEvaluation {
  version: string;
  cases: number;
  citationValidity: number;
  invalidCitationRate: number;
  citationCoverage: number | null;
  scores: CitationCaseScore[];
  failures: EvaluationFailure[];
}

export function citationFailure(caseId: string, expected: string, actual: string): EvaluationFailure {
  return {
    caseId,
    category: "citation",
    expected,
    actual,
    severity: "high",
    metadata: {},
  };
}

export function scoreCitationCase(testCase: CitationCase): CitationCaseScore {
  const validated = validateAnswerCitations(testCase.answer, testCase.claimed, testCase.evidence);
  const decided = validated.citations.length + validated.removedCount;
  const validity = decided === 0 ? 1 : validated.citations.length / decided;
  const invalidRate = decided === 0 ? 0 : validated.removedCount / decided;
  const evidenceClaims = testCase.claims.filter((claim) => claim.type === "evidence");
  const kept = new Set(validated.citations.map((citation) => citation.chunkId));
  const coverage =
    evidenceClaims.length === 0
      ? null
      : evidenceClaims.filter((claim) => claim.citationIds.some((id) => kept.has(id))).length / evidenceClaims.length;
  return {
    id: testCase.id,
    validity,
    invalidRate,
    coverage,
    kept: validated.citations.length,
    removed: validated.removedCount,
  };
}

export function evaluateCitations(version: string, cases: readonly CitationCase[]): CitationEvaluation {
  const scores = cases.map(scoreCitationCase);
  const coverageValues = scores.flatMap((score) => (score.coverage === null ? [] : [score.coverage]));
  const citationValidity = mean(scores.map((score) => score.validity));
  const failures: EvaluationFailure[] = cases.flatMap((testCase, index) => {
    const score = scores[index];
    if (!score) return [];
    if (testCase.expect === "keep" && score.kept < 1) {
      return [citationFailure(testCase.id, "at least one retrieved citation kept", `kept ${score.kept}`)];
    }
    if (testCase.expect === "reject" && score.kept !== 0) {
      return [citationFailure(testCase.id, "invented citations removed", `kept ${score.kept}`)];
    }
    if (testCase.expect === "uncited" && score.removed !== 0) {
      return [citationFailure(testCase.id, "no citations invented", `removed ${score.removed}`)];
    }
    return [];
  });
  return {
    version,
    cases: cases.length,
    citationValidity,
    invalidCitationRate: mean(scores.map((score) => score.invalidRate)),
    citationCoverage: coverageValues.length === 0 ? null : mean(coverageValues),
    scores,
    failures,
  };
}
