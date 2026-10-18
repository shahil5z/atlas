import { BenchmarkSection } from "@/components/landing/benchmark-section";
import { Reveal } from "@/components/landing/reveal";
import { AtlasSymbol } from "@/components/brand/logo";
import { MAX_ITERATIONS, MAX_SUBQUESTIONS, MAX_TOOL_CALLS_PER_AGENT } from "@/config/agents";
import { MAX_INDEX_CHUNKS } from "@/config/chunking";
import { MAX_EXTRACTED_CHARACTERS, MAX_PDF_PAGES, MAX_PDF_SIZE_LABEL } from "@/config/documents";
import { EMBEDDING_DIMENSION, EMBEDDING_DTYPE, EMBEDDING_MODEL_ID } from "@/config/embedding";
import { LOCAL_LLM_CONFIG } from "@/config/llm";
import { DEFAULT_TOP_K, LEXICAL_WEIGHT, SEMANTIC_WEIGHT } from "@/config/retrieval";

const n = (value: number) => value.toLocaleString("en-US");
const shortId = (id: string) => id.split("/").pop() ?? id;

const pipeline = [
  { step: "01", title: "Parse", body: "PDF.js, page by page." },
  { step: "02", title: "Chunk", body: "Chunks never cross a page." },
  { step: "03", title: "Embed", body: `${shortId(EMBEDDING_MODEL_ID)}, ${EMBEDDING_DIMENSION} dims.` },
  { step: "04", title: "Retrieve", body: `${SEMANTIC_WEIGHT} cosine + ${LEXICAL_WEIGHT} BM25, top ${DEFAULT_TOP_K}.` },
  { step: "05", title: "Reason", body: "Five agents, one local model." },
  { step: "06", title: "Cite", body: "Unretrieved citations are dropped." },
];

const agents = [
  { name: "Planner", body: `Up to ${MAX_SUBQUESTIONS} sub-questions.` },
  { name: "Researcher", body: `${MAX_TOOL_CALLS_PER_AGENT} validated tool calls per turn.` },
  { name: "Analyst", body: "Evidence versus inference." },
  { name: "Critic", body: `Can search again, ${MAX_ITERATIONS} iterations max.` },
  { name: "Synthesizer", body: "Answer with page citations." },
];

const specs = [
  { label: "Answer model", value: shortId(LOCAL_LLM_CONFIG.modelId).replace("-ONNX", ""), note: `${LOCAL_LLM_CONFIG.dtype} on WebGPU · ${LOCAL_LLM_CONFIG.wasmDtype} on WASM` },
  { label: "Context window", value: n(LOCAL_LLM_CONFIG.contextLength), note: "tokens" },
  { label: "Embeddings", value: `${EMBEDDING_DIMENSION}-d`, note: `${shortId(EMBEDDING_MODEL_ID)} · ${EMBEDDING_DTYPE}` },
  { label: "PDF limit", value: MAX_PDF_SIZE_LABEL, note: `${MAX_PDF_PAGES} pages · ${n(MAX_EXTRACTED_CHARACTERS)} chars` },
  { label: "Index", value: n(MAX_INDEX_CHUNKS), note: "chunks, in memory" },
  { label: "Agent loop", value: `${MAX_ITERATIONS}×`, note: "bounded iterations" },
];

function SectionHeading({ eyebrow, title, body, id }: { eyebrow: string; title: string; body?: string; id: string }) {
  return (
    <Reveal className="max-w-2xl">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#7eb0ff]">{eyebrow}</p>
      <h2 id={id} className="mt-3 text-balance text-3xl font-semibold tracking-[-0.03em] sm:text-[2.6rem] sm:leading-[1.08]">
        {title}
      </h2>
      {body ? <p className="mt-4 text-pretty text-base leading-7 text-muted-foreground">{body}</p> : null}
    </Reveal>
  );
}

export function LandingSections() {
  return (
    <div className="relative">
      <section id="pipeline" aria-labelledby="pipeline-title" className="landing-section scroll-mt-16">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <SectionHeading
            id="pipeline-title"
            eyebrow="Pipeline"
            title="PDF in. Cited answer out."
          />
          <ol className="pipeline mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-3">
            {pipeline.map((item, index) => (
              <Reveal as="li" key={item.step} delay={index * 60} className="card-surface group relative p-6 sm:p-7">
                <span className="font-mono text-xs text-[#7eb0ff]">{item.step}</span>
                <h3 className="mt-3 text-lg font-medium tracking-tight">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
                <span aria-hidden="true" className="card-sheen" />
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <section id="agents" aria-labelledby="agents-title" className="landing-section scroll-mt-16">
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <SectionHeading
            id="agents-title"
            eyebrow="Agents"
            title="Five roles. One bounded loop."
          />
          <ol className="relative space-y-3">
            <span aria-hidden="true" className="agent-rail absolute bottom-6 left-[1.35rem] top-6 w-px" />
            {agents.map((agent, index) => (
              <Reveal as="li" key={agent.name} delay={index * 70} className="relative flex gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 pr-5 transition-colors hover:border-white/20 hover:bg-white/[0.04]">
                <span className="agent-node relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#7eb0ff]/40 bg-background font-mono text-[11px] text-[#7eb0ff]">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-medium tracking-tight">
                    {agent.name}
                    {agent.name === "Critic" ? (
                      <span className="ml-2 rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        ↺ loop
                      </span>
                    ) : null}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{agent.body}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <section id="specs" aria-labelledby="specs-title" className="landing-section scroll-mt-16">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <SectionHeading
            id="specs-title"
            eyebrow="Under the hood"
            title="Small models. Hard limits."
          />
          <dl className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] lg:grid-cols-3">
            {specs.map((spec, index) => (
              <Reveal key={spec.label} delay={index * 50} className="card-surface p-5 sm:p-7">
                <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{spec.label}</dt>
                <dd className="mt-3 break-words text-xl font-semibold tracking-tight sm:text-3xl">{spec.value}</dd>
                <dd className="mt-1 text-xs leading-5 text-muted-foreground sm:text-sm">{spec.note}</dd>
              </Reveal>
            ))}
          </dl>
        </div>
      </section>

      <BenchmarkSection />

      <section aria-labelledby="cta-title" className="landing-section">
        <Reveal className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 text-center sm:px-6">
          <AtlasSymbol className="h-12 w-auto mix-blend-screen" />
          <h2 id="cta-title" className="mt-6 text-balance text-3xl font-semibold tracking-[-0.03em] sm:text-5xl">
            Ask a question. Keep your data.
          </h2>
          <a
            href="#composer"
            className="mt-8 inline-flex h-12 items-center justify-center rounded-full bg-accent px-6 text-sm font-medium text-accent-foreground transition hover:bg-white hover:shadow-[0_0_40px_rgba(126,176,255,0.35)]"
          >
            Start research
          </a>
        </Reveal>
      </section>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>An independent portfolio project · © 2026</p>
        </div>
      </footer>
    </div>
  );
}
