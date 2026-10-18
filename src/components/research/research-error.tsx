"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { ExtractionAssessment, ParsedDocument } from "@/types/documents";
import type { AtlasError, AtlasErrorCode } from "@/types/errors";

function errorTitle(code: AtlasErrorCode): string {
  if (code === "structured_output_failed") return "Atlas couldn't produce a sufficiently supported answer.";
  if (code === "llm_init_failed" || code === "llm_download_failed" || code === "model_init_failed" || code === "model_download_failed") {
    return "Atlas couldn't prepare the local model.";
  }
  if (code === "generation_failed" || code === "retrieval_failed" || code === "embedding_failed") {
    return "Atlas couldn't finish this research.";
  }
  if (code === "unsupported_runtime" || code === "worker_failed") {
    return "Atlas could not initialize local AI on this browser.";
  }
  if (code === "no_extractable_text") return "This PDF has no extractable text.";
  return "Atlas couldn't process this document.";
}

export function ResearchError({
  query,
  error,
  document,
  extraction,
  onEdit,
  onReset,
}: {
  query: string;
  error: AtlasError;
  document: ParsedDocument | null;
  extraction: ExtractionAssessment | null;
  onEdit: () => void;
  onReset: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const canRetry =
    error.code === "generation_failed" ||
    error.code === "structured_output_failed" ||
    error.code === "retrieval_failed" ||
    error.code === "embedding_failed";

  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <section className="atlas-enter mx-auto w-full max-w-2xl" aria-labelledby="error-heading">
      <p className="text-sm text-muted-foreground">Research</p>
      <h1 id="error-heading" ref={heading} tabIndex={-1} className="mt-2 font-serif text-3xl tracking-tight sm:text-4xl">
        {errorTitle(error.code)}
      </h1>
      <p role="alert" className="mt-4 max-w-xl text-base leading-7 text-foreground">
        {error.message}
      </p>
      {error.code === "structured_output_failed" ? (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Try asking a more specific question.</p>
      ) : null}
      {error.code === "unsupported_runtime" ? (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Try a browser or device with WebGPU support.</p>
      ) : null}
      {error.code === "no_extractable_text" ? (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Try a text-based PDF. Visual pages were not interpreted.</p>
      ) : null}
      {query.trim().length > 0 ? <p className="mt-6 text-sm leading-6 text-muted-foreground">{query}</p> : null}
      {document ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {document.name}
          {extraction ? ` · ${extraction.pageCount} ${extraction.pageCount === 1 ? "page" : "pages"}` : ""}
        </p>
      ) : null}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button type="button" onClick={onEdit}>
          {canRetry || !document ? "Try again" : "Choose another PDF"}
        </Button>
        <Button type="button" variant="secondary" onClick={onReset}>
          New question
        </Button>
      </div>
    </section>
  );
}
