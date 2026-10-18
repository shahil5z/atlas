import { RESEARCH_STEPS, ResearchStatus } from "@/components/research/research-stages";
import { formatFileSize } from "@/lib/format/format-file-size";
import type { PreparationDetail, ResearchPhase } from "@/types/processing";
import type { SelectedDocument } from "@/types/documents";

function stageIndex(phase: ResearchPhase): number {
  if (
    phase === "loading_model" ||
    phase === "embedding_document" ||
    phase === "indexing" ||
    phase === "embedding_query" ||
    phase === "retrieving"
  ) {
    return 1;
  }
  return 0;
}

export function ProcessingPanel({
  phase,
  attachment,
  detail,
  onStop,
}: {
  phase: ResearchPhase;
  attachment: SelectedDocument;
  detail: PreparationDetail | null;
  onStop: () => void;
}) {
  const preparing = phase === "loading_model";
  const pages = typeof detail?.pageCount === "number" ? detail.pageCount : null;
  const context = [
    attachment.name,
    pages !== null ? `${pages} ${pages === 1 ? "page" : "pages"}` : null,
    formatFileSize(attachment.size),
  ]
    .filter((item): item is string => Boolean(item))
    .join(" · ");

  return (
    <ResearchStatus
      title={preparing ? "Preparing local AI" : "Researching"}
      description={
        preparing
          ? "Atlas is loading the local model required for this device. This may take longer the first time."
          : "Reading the question against your document."
      }
      context={context}
      steps={RESEARCH_STEPS}
      currentIndex={stageIndex(phase)}
      progress={preparing ? (detail?.modelProgress ?? null) : null}
      onStop={onStop}
    />
  );
}
