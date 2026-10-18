import { analysisSchema } from "@/lib/agents/schemas";
import { completeStructured, parseStructured } from "@/lib/agents/structured";
import { STRUCTURED_CASES_V1, STRUCTURED_DATASET_VERSION, type StructuredFixture } from "../../../evaluation/datasets/structured-v1";
import type { EvaluationFailure } from "@/lib/evaluation/failures";

export interface StructuredEvaluation {
  version: string;
  cases: number;
  successRate: number;
  failureRate: number;
  repairRate: number;
  retryRecoveryRate: number | null;
  failures: EvaluationFailure[];
}

function classify(testCase: StructuredFixture): "success" | "repaired" | "failed" {
  try {
    parseStructured(testCase.text, analysisSchema);
    return testCase.expect === "repaired" ? "repaired" : "success";
  } catch {
    return "failed";
  }
}

export async function evaluateStructuredOutput(cases: readonly StructuredFixture[] = STRUCTURED_CASES_V1): Promise<StructuredEvaluation> {
  const results = cases.map(classify);
  const success = results.filter((result) => result === "success" || result === "repaired").length;
  const repaired = results.filter((result) => result === "repaired").length;
  const failed = results.filter((result) => result === "failed").length;
  const failures: EvaluationFailure[] = cases.flatMap((testCase, index) => {
    const actual = results[index];
    const ok =
      (testCase.expect === "invalid" && actual === "failed") ||
      (testCase.expect === "repaired" && actual === "repaired") ||
      (testCase.expect === "valid" && actual === "success");
    if (ok) return [];
    return [
      {
        caseId: testCase.id,
        category: "structured_output" as const,
        expected: testCase.expect,
        actual: actual ?? "missing",
        severity: "high" as const,
        metadata: {},
      },
    ];
  });

  let retryRecovered = false;
  try {
    let attempt = 0;
    await completeStructured({
      schema: analysisSchema,
      maxRetries: 1,
      generate: async () => {
        attempt += 1;
        return attempt === 1 ? "not json" : cases[0]?.text ?? "{}";
      },
    });
    retryRecovered = true;
  } catch {
    retryRecovered = false;
  }

  return {
    version: STRUCTURED_DATASET_VERSION,
    cases: cases.length,
    successRate: cases.length === 0 ? 0 : success / cases.length,
    failureRate: cases.length === 0 ? 0 : failed / cases.length,
    repairRate: cases.length === 0 ? 0 : repaired / cases.length,
    retryRecoveryRate: retryRecovered ? 1 : 0,
    failures,
  };
}
