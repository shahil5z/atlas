"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Reveal } from "@/components/landing/reveal";
import { BENCHMARK_ENVIRONMENT, BENCHMARK_RUNS, type BenchmarkRun } from "@/content/benchmarks";

const INTERVAL_MS = 5000;

export function BenchmarkSection() {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const region = useRef<HTMLDivElement>(null);
  const count = BENCHMARK_RUNS.length;
  const rotating = count > 1 && !reduced && !hovered && !focused;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // A timeout keyed on the index restarts the 5 s wait after any manual change.
  useEffect(() => {
    if (!rotating) return;
    const timer = window.setTimeout(() => setIndex((value) => (value + 1) % count), INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [rotating, index, count]);

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
          aria-label="Live test runs"
          className="relative mt-10"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setFocused(true)}
          onBlur={(event) => {
            if (!region.current?.contains(event.relatedTarget as Node)) setFocused(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") go(index + 1);
            if (event.key === "ArrowLeft") go(index - 1);
          }}
        >
          <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
            <div className="grid" aria-live={rotating ? "off" : "polite"}>
              {BENCHMARK_RUNS.map((run, i) => (
                <Slide key={run.id} run={run} position={i} count={count} active={i === index} />
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
                    aria-label={`Show live test ${i + 1}: ${run.question}`}
                    aria-current={i === index}
                    className="group flex h-8 items-center"
                  >
                    <span className={`block h-1.5 rounded-full transition-all motion-reduce:transition-none ${i === index ? "w-8 bg-[#7eb0ff]" : "w-3 bg-white/20 group-hover:bg-white/40"}`} />
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => go(index - 1)} aria-label="Previous live test" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 hover:bg-white/[0.06]">
                  <span aria-hidden="true">←</span>
                </button>
                <button type="button" onClick={() => go(index + 1)} aria-label="Next live test" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 hover:bg-white/[0.06]">
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

function Slide({ run, position, count, active }: { run: BenchmarkRun; position: number; count: number; active: boolean }) {
  const shot = run.screenshot;
  const status = run.statusShot;
  const wide = run.status.filter((row) => row.value.length > 12);
  const narrow = run.status.filter((row) => row.value.length <= 12);

  return (
    <article
      role="group"
      aria-roledescription="slide"
      aria-label={`${position + 1} of ${count}: ${run.question}`}
      aria-hidden={!active}
      inert={!active}
      data-active={active}
      className="bench-slide grid min-w-0 gap-6 p-4 [grid-area:1/1] sm:p-6 xl:grid-cols-[minmax(0,734px)_minmax(0,1fr)] xl:gap-8"
    >
      {/* The original PNG, never wider than its natural size so every word stays sharp. */}
      <div className="min-w-0 self-start">
        <a
          href={shot.src}
          target="_blank"
          rel="noopener"
          className="group relative block w-fit max-w-full overflow-hidden rounded-xl border border-white/10 bg-[#05070b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7eb0ff]"
          aria-label={`Open the full-size screenshot of the answer to “${run.question}” in a new tab`}
        >
          <Image
            unoptimized
            priority={position === 0}
            src={shot.src}
            alt={`Atlas answer screen for “${run.question}” on ${run.document}, ${run.pages}. Sections: ${run.sections.join("; ")}.`}
            width={shot.width}
            height={shot.height}
            style={{ width: "100%", maxWidth: shot.width, height: "auto" }}
            className="block"
          />
          <span className="pointer-events-none absolute right-3 top-3 rounded-full border border-white/10 bg-black/70 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/80 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none">
            Full size ↗
          </span>
        </a>
        <p className="mt-2 text-xs text-muted-foreground xl:hidden">Tap the screenshot to open it at full size.</p>
      </div>

      <div className="flex min-w-0 flex-col">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#7eb0ff]">
          {String(position + 1).padStart(2, "0")} · Live test
        </p>
        <h3 className="mt-3 text-xl font-medium leading-snug tracking-tight sm:text-2xl">“{run.question}”</h3>
        <p className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          <span className="min-w-0 break-words">{run.document}</span>
          <span aria-hidden="true">·</span>
          <span>{run.pages}</span>
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/[0.06] text-sm">
          {narrow.map((row) => (
            <div key={row.label} className="bg-background p-3">
              <dt className="text-xs text-muted-foreground">{row.label}</dt>
              <dd className="mt-1 font-mono text-base tabular-nums">{row.value}</dd>
            </div>
          ))}
          {wide.map((row) => (
            <div key={row.label} className="col-span-2 bg-background p-3">
              <dt className="text-xs text-muted-foreground">{row.label}</dt>
              <dd className="mt-1 text-sm leading-6">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6">
          <p className="text-xs text-muted-foreground">Sections in the answer</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {run.sections.map((section) => (
              <li key={section} className="rounded-full border border-white/10 px-3 py-1 text-xs text-foreground/85">
                {section}
              </li>
            ))}
          </ul>
        </div>

        <figure className="mt-6">
          <a
            href={status.src}
            target="_blank"
            rel="noopener"
            className="block w-fit max-w-full overflow-hidden rounded-lg border border-white/10 bg-[#05070b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7eb0ff]"
            aria-label="Open the original status panel screenshot in a new tab"
          >
            <Image
              unoptimized
              src={status.src}
              alt={`Original status panel: ${run.status.map((row) => `${row.label} ${row.value}`).join(", ")}.`}
              width={status.width}
              height={status.height}
              style={{ width: "100%", maxWidth: status.width, height: "auto" }}
              className="block"
            />
          </a>
          <figcaption className="mt-2 text-xs text-muted-foreground">Original status panel from the same run.</figcaption>
        </figure>
      </div>
    </article>
  );
}
