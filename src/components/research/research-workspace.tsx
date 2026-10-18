"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnswerText } from "@/components/research/answer-text";
import { CitedText } from "@/components/research/cited-text";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/retrieval/metrics";
import type { AnswerSection, StructuredAnswer } from "@/lib/agents/types";
import { answerAsPlainText, buildResultViewModel } from "@/lib/presentation/result-view-model";
import type { ResearchSession } from "@/types/session";

export function ResearchWorkspace({ session, onReset }: { session: ResearchSession; onReset: () => void }) {
  const view = useMemo(() => buildResultViewModel(session), [session]);
  const heading = useRef<HTMLHeadingElement>(null);
  const answer = view.answer;

  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <div className="atlas-enter mx-auto flex w-full min-w-0 max-w-[42rem] flex-col gap-12">
      <header className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Research result</p>
          <div className="flex items-center gap-2">
            {answer && !answer.failed ? <CopyAnswer text={answerAsPlainText(view)} /> : null}
            <Button type="button" variant="secondary" size="sm" onClick={onReset}>
              New question
            </Button>
          </div>
        </div>
        <h1
          ref={heading}
          tabIndex={-1}
          className="mt-6 break-words font-serif text-[1.75rem] leading-[1.2] tracking-tight text-foreground outline-none sm:text-[2.125rem]"
        >
          {view.question}
        </h1>
        {view.document ? (
          <p className="mt-4 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <span className="min-w-0 truncate">{view.document.name}</span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0">
              {view.document.pageCount} {view.document.pageCount === 1 ? "page" : "pages"}
            </span>
          </p>
        ) : null}
      </header>

      <article aria-labelledby="answer-heading" className="min-w-0">
        <h2 id="answer-heading" className="sr-only">
          Answer
        </h2>
        {answer?.fromModelKnowledge ? (
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            From the local model&rsquo;s general knowledge · no document used
          </p>
        ) : null}
        {!answer ? (
          <p className="text-muted-foreground">No answer was produced.</p>
        ) : answer.failed ? (
          <p className="text-lg leading-8 text-foreground/90">{answer.text}</p>
        ) : answer.structured ? (
          <StructuredView structured={answer.structured} />
        ) : (
          <AnswerText text={answer.text} />
        )}
        {view.notes.length > 0 ? (
          <p className="mt-8 border-l border-border pl-4 text-sm leading-6 text-muted-foreground">{view.notes.join(" ")}</p>
        ) : null}
      </article>

      <details className="group border-t border-border pt-5 text-sm text-muted-foreground">
        <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 hover:text-foreground [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90 motion-reduce:transition-none">
            ›
          </span>
          How Atlas researched this
        </summary>
        <dl className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-2 sm:max-w-sm">
          {view.process.pagesAnalyzed !== null ? (
            <Row label="Pages analyzed" value={String(view.process.pagesAnalyzed)} />
          ) : (
            <Row label="Document" value="None attached" />
          )}
          {view.process.passagesRetrieved > 0 ? <Row label="Passages retrieved" value={String(view.process.passagesRetrieved)} /> : null}
          {view.process.citationsUsed > 0 ? <Row label="Citations used" value={String(view.process.citationsUsed)} /> : null}
          {view.process.totalMs !== null ? <Row label="Total time" value={formatDuration(view.process.totalMs)} /> : null}
          <Row label="Processing" value={view.process.system.model === "OpenAI" ? "OpenAI, with the local model as fallback" : "Locally, in this browser"} />
        </dl>
        <details className="mt-5">
          <summary className="min-h-8 cursor-pointer text-xs uppercase tracking-[0.14em] hover:text-foreground">System details</summary>
          <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-2 sm:max-w-sm">
            <Row label="Model" value={view.process.system.model} />
            <Row label="Embeddings" value={view.process.system.embeddings} />
            <Row label="Runtime" value={view.process.system.runtime} />
          </dl>
          <p className="mt-3 text-xs leading-5">
            {view.process.system.model === "OpenAI"
              ? "OpenAI writes the answer from the extracted text. If that call fails, Atlas uses the local model."
              : "Speed depends on this device. Atlas does not claim frontier-model quality."}
          </p>
        </details>
      </details>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className="text-right tabular-nums text-foreground/90">{value}</dd>
    </>
  );
}

function CopyAnswer({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const timer = window.setTimeout(() => setState("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [state]);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => {
        // Copies only on this explicit click. Nothing is stored.
        if (!navigator.clipboard) {
          setState("failed");
          return;
        }
        navigator.clipboard.writeText(text).then(
          () => setState("copied"),
          () => setState("failed"),
        );
      }}
    >
      <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy answer"}</span>
    </Button>
  );
}

function StructuredView({ structured }: { structured: StructuredAnswer }) {
  return (
    <div className="atlas-prose space-y-9">
      {structured.overview.trim().length > 0 ? (
        <p className="text-[1.1875rem] leading-8 text-foreground">
          <CitedText text={structured.overview} />
        </p>
      ) : null}
      {structured.sections.map((section, index) => (
        <SectionView key={`${section.heading}-${index}`} section={section} />
      ))}
    </div>
  );
}

function SectionView({ section }: { section: AnswerSection }) {
  const numbered = section.bullets.length > 1 && section.bullets.every((bullet) => /^\d+[.)]\s+/.test(bullet));
  const table = section.table;
  const takeaway = /^key takeaway$/i.test(section.heading.trim());
  return (
    <section className={takeaway ? "rounded-lg border border-border px-5 py-4" : undefined}>
      {section.heading.trim().length > 0 ? (
        <h3 className={takeaway ? "text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground" : "font-serif text-xl tracking-tight text-foreground"}>
          {section.heading}
        </h3>
      ) : null}
      {section.paragraphs.map((paragraph) => (
        <p key={paragraph} className={section.heading ? "mt-3" : undefined}>
          <CitedText text={paragraph} />
        </p>
      ))}
      {section.bullets.length > 0 ? (
        numbered ? (
          <ol className="mt-3 list-decimal space-y-2 pl-6 marker:font-mono marker:text-sm marker:text-muted-foreground">
            {section.bullets.map((bullet) => (
              <li key={bullet} className="pl-1">
                <CitedText text={bullet.replace(/^\d+[.)]\s+/, "")} />
              </li>
            ))}
          </ol>
        ) : (
          <ul className="mt-3 list-disc space-y-2 pl-5 marker:text-muted-foreground">
            {section.bullets.map((bullet) => (
              <li key={bullet} className="pl-1">
                <CitedText text={bullet} />
              </li>
            ))}
          </ul>
        )
      ) : null}
      {table && table.headers.length > 0 && table.rows.length > 0 ? (
        <div className="mt-4 max-w-full overflow-x-auto rounded-md border border-border" role="region" aria-label={table.caption ?? section.heading ?? "Table"} tabIndex={0}>
          <table className="w-full min-w-[20rem] border-collapse text-left text-sm">
            {table.caption ? <caption className="px-3 pt-3 text-left text-muted-foreground">{table.caption}</caption> : null}
            <thead>
              <tr className="border-b border-border">
                {table.headers.map((header) => (
                  <th key={header} scope="col" className="px-3 py-2 font-medium text-foreground">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-border/60 last:border-0">
                  {row.map((cell, cellIndex) =>
                    cellIndex === 0 ? (
                      <th key={cellIndex} scope="row" className="px-3 py-2 align-top font-normal text-muted-foreground">
                        {cell}
                      </th>
                    ) : (
                      <td key={cellIndex} className="px-3 py-2 align-top">
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
