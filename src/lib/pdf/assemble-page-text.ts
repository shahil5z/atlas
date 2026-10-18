export interface PageTextFragment {
  str: string;
  hasEOL: boolean;
}

/**
 * Rebuilds a page from PDF.js text items while keeping line breaks.
 * The returned string is the canonical page text used for chunk offsets.
 */
export function assemblePageText(items: readonly PageTextFragment[]): string {
  let text = "";

  for (const item of items) {
    text += item.str;
    if (item.hasEOL) {
      text += "\n";
    } else if (item.str.length > 0) {
      text += " ";
    }
  }

  return text
    .replace(/[ ]+\n/g, "\n")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
