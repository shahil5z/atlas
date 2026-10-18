"use client";

import { RESEARCH_STEPS, ResearchStatus } from "@/components/research/research-stages";
import type { ResearchStage } from "@/features/research/research-state";
import { formatFileSize } from "@/lib/format/format-file-size";
import type { ParsedDocument, SelectedDocument } from "@/types/documents";

function stageIndex(stage: ResearchStage, hasDocument: boolean): number {
  const offset = hasDocument ? 0 : -1;
  if (stage === "loading_model" || stage === "planning" || stage === "retrieving") return 1 + offset;
  if (stage === "analyzing" || stage === "checking") return 2 + offset;
  return 3 + offset;
}

export function ResearchProgress({
  stage,
  modelProgress,
  document,
  attachment,
  onStop,
}: {
  stage: ResearchStage;
  modelProgress: number | null;
  document: ParsedDocument | null;
  attachment: SelectedDocument | null;
  onStop: () => void;
}) {
  const hasDocument = Boolean(document || attachment);
  const preparing = stage === "loading_model";
  const name = document?.name ?? attachment?.name ?? null;
  const size = document?.size ?? attachment?.size;
  const pages = document?.pageCount;
  const context = name
    ? [name, typeof pages === "number" ? `${pages} ${pages === 1 ? "page" : "pages"}` : null, typeof size === "number" ? formatFileSize(size) : null]
        .filter((item): item is string => Boolean(item))
        .join(" · ")
    : null;

  return (
    <ResearchStatus
      title={preparing ? "Preparing local AI" : "Researching"}
      description={
        preparing
          ? "Atlas is loading the local model required for this device. This may take longer the first time."
          : hasDocument
            ? "Reading the question, then keeping only the evidence that answers it."
            : "Reading the question, then answering it directly."
      }
      context={context}
      steps={hasDocument ? RESEARCH_STEPS : RESEARCH_STEPS.slice(1)}
      currentIndex={stageIndex(stage, hasDocument)}
      progress={preparing ? modelProgress : null}
      onStop={onStop}
    />
  );
}
