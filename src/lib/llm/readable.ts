/** Rejects symbol soup from a broken quant or a degenerate decode. */
export function isReadableModelText(text: string, minLetters = 20): boolean {
  const trimmed = text.trim();
  const letters = trimmed.match(/[A-Za-z]/g)?.length ?? 0;
  if (letters < minLetters) return false;
  const weird = trimmed.match(/[^A-Za-z0-9\s.,;:'"?!()\-\n]/g)?.length ?? 0;
  return weird <= Math.max(2, Math.floor(letters / 4));
}

/** Drops tags and URLs, then keeps the sentence only when it still reads as prose. */
export function presentableAnswer(text: string): string | null {
  const cleaned = text
    .replace(/<\/?[A-Za-z_][^>]*>/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return isReadableModelText(cleaned) ? cleaned.slice(0, 2_000) : null;
}
