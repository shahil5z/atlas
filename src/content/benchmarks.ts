// Live tests the author ran on the deployed Atlas app on October 18, 2026.
// Every value below is copied from the screenshots in public/benchmarks.
// Edit these only when the screenshots change, and keep the text exactly as it appears.

export type BenchmarkImage = {
  src: string;
  width: number;
  height: number;
};

export type BenchmarkStatusRow = {
  label: string;
  value: string;
};

export type BenchmarkRun = {
  id: string;
  /** The question as it was typed. */
  question: string;
  document: string;
  pages: string;
  /** Section headings visible in the answer screenshot. */
  sections: string[];
  /** Rows of the "How Atlas researched this" panel, in on-screen order. */
  status: BenchmarkStatusRow[];
  /** Full answer screen. Shown at no more than its natural size. */
  screenshot: BenchmarkImage;
  /** The original status panel. */
  statusShot: BenchmarkImage;
};

export const BENCHMARK_ENVIRONMENT = "Live tests on the deployed app, October 2026.";

export const BENCHMARK_RUNS: BenchmarkRun[] = [
  {
    id: "live-1",
    question: "what is the future of ai according to this pdf?",
    document: "Impact of AI Until 2050.pdf",
    pages: "13 pages",
    sections: ["Economic and Job Market Impact", "Social, Ethical, and Cultural Implications"],
    status: [
      { label: "Pages analyzed", value: "13" },
      { label: "Passages retrieved", value: "4" },
      { label: "Citations used", value: "4" },
      { label: "Total time", value: "5.44 s" },
      { label: "Processing", value: "OpenAI, with the local model as fallback" },
    ],
    screenshot: { src: "/benchmarks/live-1.png", width: 707, height: 822 },
    statusShot: { src: "/benchmarks/live-1-status.png", width: 472, height: 238 },
  },
  {
    id: "live-2",
    question: "what is the pdf about?",
    document: "Crack.pdf",
    pages: "37 pages",
    sections: ["Transformer Architecture and Implementation", "Retrieval-Augmented Generation (RAG) Systems"],
    status: [
      { label: "Pages analyzed", value: "37" },
      { label: "Passages retrieved", value: "5" },
      { label: "Citations used", value: "5" },
      { label: "Total time", value: "7.00 s" },
      { label: "Processing", value: "OpenAI, with the local model as fallback" },
    ],
    screenshot: { src: "/benchmarks/live-2.png", width: 732, height: 812 },
    statusShot: { src: "/benchmarks/live-2-status.png", width: 456, height: 196 },
  },
];
