import { useEffect, useRef, type KeyboardEvent } from "react";
import { MAX_PDF_SIZE_LABEL, PDF_FILE_ACCEPT } from "@/config/documents";
import { MAX_QUERY_LENGTH, QUERY_PLACEHOLDER } from "@/config/app";
import { DocumentChip } from "@/components/research/document-chip";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { SelectedDocument } from "@/types/documents";
import type { AtlasError } from "@/types/errors";

interface ResearchComposerProps {
  query: string;
  attachment: SelectedDocument | null;
  fieldError: AtlasError | null;
  onQueryChange: (query: string) => void;
  onFile: (file: File) => void;
  onClearFile: () => void;
  onStart: () => void;
}

const MIN_HEIGHT = 144;
const MAX_HEIGHT = 240;

function fitTextarea(node: HTMLTextAreaElement | null) {
  if (!node) return;
  node.style.height = "auto";
  const next = Math.min(Math.max(node.scrollHeight, MIN_HEIGHT), MAX_HEIGHT);
  node.style.height = `${next}px`;
}

export function ResearchComposer({
  query,
  attachment,
  fieldError,
  onQueryChange,
  onFile,
  onClearFile,
  onStart,
}: ResearchComposerProps) {
  const field = useRef<HTMLTextAreaElement>(null);
  const showCount = query.trim().length > MAX_QUERY_LENGTH * 0.8;
  const describedBy = [fieldError ? "composer-error" : null, showCount ? "query-count" : null]
    .filter((item): item is string => Boolean(item))
    .join(" ");

  useEffect(() => {
    fitTextarea(field.current);
  }, [query]);

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onStart();
    }
  }

  return (
    <form
      className="composer-card relative rounded-2xl border border-white/10 bg-card/80 p-3 shadow-[0_20px_80px_-20px_rgba(40,100,220,0.35)] backdrop-blur-md transition-[border-color,box-shadow] focus-within:border-[#7eb0ff]/50 sm:p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onStart();
      }}
    >
      <label htmlFor="research-question" className="sr-only">
        Research question
      </label>
      <Textarea
        ref={field}
        id="research-question"
        name="research-question"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={QUERY_PLACEHOLDER}
        maxLength={MAX_QUERY_LENGTH + 200}
        autoComplete="off"
        aria-invalid={fieldError?.code === "invalid_query" || fieldError?.code === "query_too_long"}
        aria-describedby={describedBy || undefined}
        className="resize-none overflow-y-auto px-2 py-2"
      />

      {attachment ? (
        <div className="mx-1 mb-3">
          <DocumentChip name={attachment.name} size={attachment.size} onRemove={onClearFile} />
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-border px-1 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <input
            id="pdf-file"
            type="file"
            accept={PDF_FILE_ACCEPT}
            className="peer sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onFile(file);
            }}
          />
          <label
            htmlFor="pdf-file"
            className="inline-flex h-11 cursor-pointer items-center justify-center rounded-lg border border-border bg-card px-4 transition-colors text-sm font-medium text-foreground peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring hover:bg-muted"
          >
            {attachment ? "Replace PDF" : "Add PDF"}
          </label>
          <p className="text-xs text-muted-foreground">PDFs up to {MAX_PDF_SIZE_LABEL}</p>
        </div>
        <Button type="submit" size="lg" className="w-full sm:w-auto">
          Start Research
        </Button>
      </div>

      {showCount ? (
        <p
          id="query-count"
          className={query.trim().length > MAX_QUERY_LENGTH ? "px-1 pt-3 text-xs text-danger" : "px-1 pt-3 text-xs text-muted-foreground"}
        >
          {query.trim().length.toLocaleString("en-US")} / {MAX_QUERY_LENGTH.toLocaleString("en-US")}
        </p>
      ) : null}

      {fieldError ? (
        <p id="composer-error" role="alert" className="px-1 pt-3 text-sm text-danger">
          {fieldError.message}
        </p>
      ) : null}
    </form>
  );
}
