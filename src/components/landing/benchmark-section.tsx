"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Reveal } from "@/components/landing/reveal";
import { BENCHMARK_ENVIRONMENT, BENCHMARK_RUNS } from "@/content/benchmarks";

const INTERVAL_MS = 4000;

function seconds(ms: number) {
  return ms >= 120000 ? `${Math.round(ms / 60000)} min` : `${(ms / 1000).toFixed(1)} s`;
}

export function BenchmarkSection() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const region = useRef<HTMLDivElement>(null);
  const count = BENCHMARK_RUNS.length;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (paused || reduced || count < 2) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % count), INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [paused, reduced, count]);

  const go = useCallback((next: number) => setIndex(((next % count) + count) % count), [count]);

  if (count === 0) return null;

  return (
    <section id="benchmark" aria-labelledby="benchmark-title" className="landing-section scroll-mt-16">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#7eb0ff]">Benchmark</p>
            <h2 id="benchmark-title" className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-[2.6rem] sm:leading-[1.08]">
              Real runs. Real numbers.
            </h2>
          </div>
          <p className="font-mono text-xs text-muted-foreground">{BENCHMARK_ENVIRONMENT}</p>
        </Reveal>

        <div
          ref={region}
          role="region"
          aria-roledescription="carousel"
          aria-label="Benchmark runs"
          className="relative mt-10"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={(event) => {
            if (!region.current?.contains(event.relatedTarget as Node)) setPaused(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") go(index + 1);
            if (event.key === "ArrowLeft") go(index - 1);
          }}
        >
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
            <div className="bench-track" style={{ transform: `translateX(-${index * 100}%)` }} aria-live={paused ? "polite" : "off"}>
              {BENCHMARK_RUNS.map((run, i) => (
                <article
                  key={run.id}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${i + 1} of ${count}: ${run.type}`}
                  aria-hidden={i !== index}
                  className="grid w-full shrink-0 gap-6 p-4 sm:p-6 lg:grid-cols-[1.35fr_1fr] lg:gap-10 lg:p-8"
                >
                  <div className="relative aspect-[16/11] overflow-hidden rounded-xl border border-white/10 bg-black">
                    <Image
                      src={run.screenshot}
                      alt={`Atlas answer for: ${run.question}`}
                      width={run.width}
                      height={run.height}
                      sizes="(min-width: 1024px) 640px, 100vw"
                      className="h-full w-full object-cover object-top"
                    />
                  </div>
                  <div className="flex min-w-0 flex-col justify-center">
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#7eb0ff]">
                      {String(i + 1).padStart(2, "0")} · {run.type}
                    </p>
                    <h3 className="mt-3 text-xl font-medium leading-snug tracking-tight sm:text-2xl">“{run.question}”</h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{run.summary}</p>
                    <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/[0.06] text-sm">
                      {[
                        ["Result", run.status === "answered" ? "Answered" : run.status === "error" ? "Model error" : "Timed out"],
                        [run.status === "answered" ? "Time to answer" : "Stopped after", seconds(run.timeToAnswerMs)],
                        ["Citations", String(run.citations)],
                        ["Backend", run.backend],
                      ].map(([label, value]) => (
                        <div key={label} className="bg-background p-3">
                          <dt className="text-xs text-muted-foreground">{label}</dt>
                          <dd className="mt-1 font-mono text-base">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-3 text-xs text-muted-foreground">{run.document}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>

          {count > 1 && (
          <div className="mt-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {BENCHMARK_RUNS.map((run, i) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Show run ${i + 1}: ${run.type}`}
                  aria-current={i === index}
                  className="group flex h-8 items-center"
                >
                  <span className={`block h-1.5 rounded-full transition-all ${i === index ? "w-8 bg-[#7eb0ff]" : "w-3 bg-white/20 group-hover:bg-white/40"}`} />
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => go(index - 1)} aria-label="Previous run" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 hover:bg-white/[0.06]">
                <span aria-hidden="true">←</span>
              </button>
              <button type="button" onClick={() => go(index + 1)} aria-label="Next run" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 hover:bg-white/[0.06]">
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
          )}
        </div>
      </div>
    </section>
  );
}
