export type TextPart = { type: "text"; value: string } | { type: "citation"; id: number };

export function citationParts(text: string): TextPart[] {
  const parts = text.split(/(\[\d+\])/g).filter((part) => part.length > 0);
  return parts.map((part) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (!match?.[1]) return { type: "text", value: part };
    return { type: "citation", id: Number(match[1]) };
  });
}

export function CitedText({
  text,
  onCite,
  validIds,
}: {
  text: string;
  onCite?: (id: number) => void;
  /** When given, markers outside this set are dropped instead of rendered as dead links. */
  validIds?: ReadonlySet<number>;
}) {
  if (!onCite) return text.replace(/\s*\[\d+\]/g, "");
  return citationParts(text).map((part, index) => {
    if (part.type === "text") return <span key={index}>{part.value}</span>;
    if (validIds && !validIds.has(part.id)) return null;
    return (
      <button
        key={index}
        type="button"
        className="citation-marker mx-0.5 inline-flex h-[1.35em] min-w-[1.35em] translate-y-[-0.1em] items-center justify-center rounded-[0.3em] border border-border px-1 align-middle font-mono text-[0.7em] leading-none text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
        onClick={() => onCite(part.id)}
        aria-label={`Show source ${part.id}`}
      >
        {part.id}
      </button>
    );
  });
}
