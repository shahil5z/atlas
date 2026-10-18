import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/format/format-file-size";

export function DocumentChip({
  name,
  size,
  pageCount,
  onRemove,
}: {
  name: string;
  size: number;
  pageCount?: number;
  onRemove?: () => void;
}) {
  const meta = [
    typeof pageCount === "number" ? `${pageCount} ${pageCount === 1 ? "page" : "pages"}` : null,
    formatFileSize(size),
  ]
    .filter((item): item is string => Boolean(item))
    .join(" · ");

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
      <span className="flex h-9 w-10 shrink-0 items-center justify-center rounded-md border border-border text-[10px] tracking-wide text-muted-foreground">
        PDF
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{name}</p>
        <p className="text-xs text-muted-foreground">{meta}</p>
      </div>
      {onRemove ? (
        <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label={`Remove ${name}`}>
          Remove
        </Button>
      ) : null}
    </div>
  );
}
