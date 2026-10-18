import { CitedText } from "@/components/research/cited-text";

/**
 * Renders model output as plain React text. Model and PDF text are never
 * inserted as HTML. Supported subset: paragraphs, "-"/"*" bullets, numbered
 * lists, "#"/"##"/"###" headings and **bold** spans. Anything else stays literal.
 */
function Inline({ text, onCite, validIds }: { text: string; onCite?: (id: number) => void; validIds?: ReadonlySet<number> }) {
  const pieces = text.split(/(\*\*[^*\n]{1,200}\*\*)/g).filter((piece) => piece.length > 0);
  return pieces.map((piece, index) =>
    /^\*\*[^*]+\*\*$/.test(piece) ? (
      <strong key={index} className="font-semibold text-foreground">
        <CitedText text={piece.slice(2, -2)} onCite={onCite} validIds={validIds} />
      </strong>
    ) : (
      <CitedText key={index} text={piece} onCite={onCite} validIds={validIds} />
    ),
  );
}

export function AnswerText({
  text,
  onCite,
  validIds,
}: {
  text: string;
  onCite?: (id: number) => void;
  validIds?: ReadonlySet<number>;
}) {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  return (
    <div className="atlas-prose space-y-5">
      {blocks.map((block, index) => {
        const lines = block.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
        const bullets = lines.every((line) => /^[-*]\s+/.test(line));
        const numbered = lines.length > 1 && lines.every((line) => /^\d+[.)]\s+/.test(line));
        if (bullets) {
          return (
            <ul key={index} className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
              {lines.map((line, item) => (
                <li key={item}>
                  <Inline text={line.replace(/^[-*]\s+/, "")} onCite={onCite} validIds={validIds} />
                </li>
              ))}
            </ul>
          );
        }
        if (numbered) {
          return (
            <ol key={index} className="list-decimal space-y-2 pl-5 marker:text-muted-foreground">
              {lines.map((line, item) => (
                <li key={item}>
                  <Inline text={line.replace(/^\d+[.)]\s+/, "")} onCite={onCite} validIds={validIds} />
                </li>
              ))}
            </ol>
          );
        }
        const heading = lines.length === 1 ? lines[0] : null;
        if (heading && /^#{1,3}\s+/.test(heading)) {
          return (
            <h2 key={index} className="pt-2 font-serif text-xl tracking-tight text-foreground">
              {heading.replace(/^#{1,3}\s+/, "").replace(/\*\*/g, "")}
            </h2>
          );
        }
        return (
          <p key={index}>
            <Inline text={lines.join(" ")} onCite={onCite} validIds={validIds} />
          </p>
        );
      })}
    </div>
  );
}
