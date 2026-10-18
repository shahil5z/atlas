/**
 * Provisional thresholds from the deterministic fixtures, not from a live model.
 * They fail the eval command when a metric drops below the fixture result.
 * Replace them only when the dataset version changes on purpose.
 */
export const PROVISIONAL_BASELINE = {
  datasetNote: "provisional fixture baseline, not a live-model score",
  /** Hybrid Recall@5 on retrieval-v1. Semantic and MMR matched it, so both deltas were 0. */
  minimumRecallAt5: 1,
  /** structured-v1 success includes the trailing-comma repair. Four of seven cases are expected failures. */
  minimumStructuredSuccessRate: 0.4,
  maximumStructuredFailureRate: 0.6,
} as const;
