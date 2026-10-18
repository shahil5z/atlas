// Generated from real Playwright runs in /workspace/atlas/bench. Do not edit by hand.
export type BenchmarkRun = {
  id: string;
  /** answered, or did not finish: model error / hit the time cap. */
  status: "answered" | "error" | "timed-out";
  type: string;
  question: string;
  document: string;
  summary: string;
  /** Wall-clock ms from clicking submit until the answer rendered or the run was stopped. */
  timeToAnswerMs: number;
  citations: number;
  passagesRetrieved: number;
  pagesAnalyzed: number;
  pagesCited: number[];
  backend: string;
  model: string;
  screenshot: string;
  width: number;
  height: number;
};

export const BENCHMARK_ENVIRONMENT = "Headless Chromium on an 8 vCPU cloud VM, no GPU. Measured October 2026.";

const ALL_RUNS: BenchmarkRun[] = [
  {
    "id": "summary",
    "status": "answered",
    "type": "Summary",
    "question": "Summarize this paper.",
    "document": "mistral7b.pdf",
    "summary": "Answered in about a minute with a page 1 citation.",
    "timeToAnswerMs": 72325,
    "citations": 1,
    "passagesRetrieved": 1,
    "pagesAnalyzed": 9,
    "pagesCited": [
      1
    ],
    "backend": "WASM",
    "model": "SmolLM2-360M-Instruct",
    "screenshot": "/benchmarks/summary.png",
    "width": 2560,
    "height": 3370
  },
  {
    "id": "factual",
    "status": "error",
    "type": "Factual lookup",
    "question": "What sliding window size does Mistral 7B use?",
    "document": "mistral7b.pdf",
    "summary": "Stopped at evidence search: the WebGPU device (SwiftShader) lacks f16, so the model errored.",
    "timeToAnswerMs": 2400129,
    "citations": 0,
    "passagesRetrieved": 0,
    "pagesAnalyzed": 0,
    "pagesCited": [],
    "backend": "WebGPU",
    "model": "",
    "screenshot": "/benchmarks/factual.png",
    "width": 2560,
    "height": 1800
  },
  {
    "id": "comparison",
    "status": "timed-out",
    "type": "Comparison",
    "question": "How does LLaMA-13B compare to GPT-3?",
    "document": "llama.pdf",
    "summary": "Still searching for evidence when the 12 minute cap hit. CPU-only WASM is too slow here.",
    "timeToAnswerMs": 720048,
    "citations": 0,
    "passagesRetrieved": 0,
    "pagesAnalyzed": 0,
    "pagesCited": [],
    "backend": "WASM",
    "model": "",
    "screenshot": "/benchmarks/comparison.png",
    "width": 2560,
    "height": 1800
  },
  {
    "id": "numeric",
    "status": "timed-out",
    "type": "Numeric extraction",
    "question": "How many layers and attention heads does Mistral 7B have?",
    "document": "mistral7b.pdf",
    "summary": "Still searching for evidence when the 12 minute cap hit.",
    "timeToAnswerMs": 1064328,
    "citations": 0,
    "passagesRetrieved": 0,
    "pagesAnalyzed": 0,
    "pagesCited": [],
    "backend": "WASM",
    "model": "",
    "screenshot": "/benchmarks/numeric.png",
    "width": 2560,
    "height": 1800
  },
  {
    "id": "multihop",
    "status": "timed-out",
    "type": "Multi-hop",
    "question": "How do sliding window attention and the rolling buffer cache together reduce memory use?",
    "document": "mistral7b.pdf",
    "summary": "Still searching for evidence when the 12 minute cap hit.",
    "timeToAnswerMs": 779888,
    "citations": 0,
    "passagesRetrieved": 0,
    "pagesAnalyzed": 0,
    "pagesCited": [],
    "backend": "WASM",
    "model": "",
    "screenshot": "/benchmarks/multihop.png",
    "width": 2560,
    "height": 1800
  }
];

/** Only runs that produced a real, completed answer are shown. */
export const BENCHMARK_RUNS: BenchmarkRun[] = ALL_RUNS.filter((run) => run.status === "answered");
