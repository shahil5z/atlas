/** Hard caps for the in-browser research loop. They are not learned. */
export const MAX_SUBQUESTIONS = 4;
export const MAX_RESEARCH_STEPS = 4;
export const MAX_ITERATIONS = 2;
export const MAX_TOOL_CALLS_PER_AGENT = 2;
export const MAX_STRUCTURED_OUTPUT_RETRIES = 2;
export const MAX_LLM_RETRIES = 1;

/**
 * Structured calls use greedy decoding so JSON is more stable.
 * The final answer uses a low temperature so wording can vary without wandering.
 */
export const STRUCTURED_DO_SAMPLE = false;
export const FINAL_DO_SAMPLE = true;
