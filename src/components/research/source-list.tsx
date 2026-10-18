"use client";

import { useEffect } from "react";
import type { SourceViewModel } from "@/lib/presentation/result-view-model";

export function SourceList({
  sources,
  activeId,
  openIds,
  onToggle,
}: {
  sources: SourceViewModel[];
  activeId: number | null;
  openIds: ReadonlySet<number>;
  onToggle: (id: number) => void;
}) {
  useEffect(() => {
    if (activeId === null) return;
    const node = document.getElementById(`source-${activeId}`);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    node?.focus({ preventScroll: true });
  }, [activeId]);

  if (sources.length === 0) return null;

  return (
    <section aria-labelledby="sources-heading" className="border-t border-border pt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="sources-heading" className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Sources
        </h2>
        <p className="text-xs text-muted-foreground">
          {sources.length} {sources.length === 1 ? "passage" : "passages"} cited
        </p>
      </div>
      <ol className="mt-6 divide-y divide-border/70">
        {sources.map((source) => {
          const expanded = openIds.has(source.id);
          const active = activeId === source.id;
          const canExpand = source.passage.replace(/\s+/g, " ").trim().length > source.snippet.replace(/…$/, "").length + 8;
          const passageId = `source-passage-${source.id}`;
          return (
            <li
              key={source.id}
              id={`source-${source.id}`}
              tabIndex={-1}
              aria-current={active ? "true" : undefined}
              className={`source-item grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 py-5 outline-none first:pt-0 ${active ? "source-active" : ""}`}
            >
              <span className="pt-0.5 font-mono text-xs tabular-nums text-muted-foreground" aria-hidden="true">
                {String(source.id).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="sr-only">Source {source.id}: </span>
                  <span className="min-w-0 max-w-full truncate text-foreground">{source.documentName}</span>
                  {active ? (
                    <span className="text-xs text-foreground/80">
                      <span aria-hidden="true">← </span>cited above
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Page {source.pageNumber}
                  {source.heading ? <span> · {source.heading}</span> : null}
                </p>
                {source.snippet ? (
                  <blockquote className="mt-3 break-words border-l border-border pl-3 text-[0.9375rem] leading-7 text-foreground/90">
                    {source.snippet}
                  </blockquote>
                ) : null}
                {canExpand ? (
                  <>
                    <button
                      type="button"
                      className="mt-3 inline-flex min-h-8 items-center text-sm text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground"
                      aria-expanded={expanded}
                      aria-controls={passageId}
                      onClick={() => onToggle(source.id)}
                    >
                      {expanded ? "Hide passage" : "View passage"}
                    </button>
                    {expanded ? (
                      <div
                        id={passageId}
                        className="mt-3 max-h-80 overflow-y-auto whitespace-pre-line break-words rounded-md bg-muted/50 px-4 py-3 text-sm leading-6 text-muted-foreground"
                      >
                        <p className="mb-2 text-xs uppercase tracking-[0.14em]">Full passage · page {source.pageNumber}</p>
                        {source.passage}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
