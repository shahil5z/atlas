export const FAILURE_CATEGORIES = [
  "retrieval",
  "citation",
  "generation",
  "agent",
  "performance",
  "runtime",
  "structured_output",
  "security",
] as const;

export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];

export type FailureSeverity = "low" | "medium" | "high" | "critical";

export interface EvaluationFailure {
  caseId: string;
  category: FailureCategory;
  expected: string;
  actual: string;
  severity: FailureSeverity;
  metadata: Record<string, string | number | boolean | null>;
}
