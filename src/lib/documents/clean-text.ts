/**
 * Conservative cleanup for text extracted from PDFs. Everything here treats
 * page text as untrusted data: it only removes or joins, it never interprets.
 */

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const URL = /\bhttps?:\/\/\S+|\bwww\.\S+/i;

/** Joins words split across lines ("perfor- mance" → "performance"). */
export function dehyphenate(text: string): string {
  return text.replace(/([a-z])-\s+([a-z])/g, "$1$2");
}

export function collapse(text: string): string {
  return dehyphenate(text).replace(/\s+/g, " ").trim();
}

/** A line made mostly of personal names separated by commas, e.g. an author list. */
export function isAuthorLine(line: string): boolean {
  const parts = line.split(/,|\band\b/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 3) return false;
  const names = parts.filter((part) => /^(?:[A-Z][\p{L}'’.-]+\s?){1,4}$/u.test(part) && part.split(/\s+/).length <= 4);
  return names.length / parts.length >= 0.7;
}

export function isPageNumberLine(line: string): boolean {
  return /^(?:page\s*)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?$/i.test(line.trim());
}

/** Lines that talk to an assistant instead of describing the document. */
export function isPromptLike(text: string): boolean {
  return /\b(please provide|i(?:'|’)ll be|i need the specific|i(?:'|’)m happy to|i am happy to|once i have|happy to assist|following formats|formal and concise|formal language|provide the \d+ subtopics|here are \d+ subtopics)\b/i.test(
    text,
  );
}

export function isBoilerplateLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return true;
  if (isPageNumberLine(trimmed)) return true;
  if (/^(abstract|contents|table of contents|keywords?:?)$/i.test(trimmed)) return true;
  if (EMAIL.test(trimmed) && trimmed.length < 120) return true;
  if (/^(code|webpage|url|website|doi|arxiv)\s*:/i.test(trimmed)) return true;
  if (/^(figure|fig\.|table)\s+\d+/i.test(trimmed)) return true;
  return isAuthorLine(trimmed);
}

/** Sentences of a block of text after dropping boilerplate lines. */
export function cleanSentences(text: string): string[] {
  const body = text
    .split(/\n+/)
    .filter((line) => !isBoilerplateLine(line))
    .join(" ");
  return collapse(body)
    .replace(URL, "")
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => isCompleteSentence(sentence));
}

export function isCompleteSentence(sentence: string): boolean {
  if (sentence.length < 30 || sentence.length > 420) return false;
  if (!/^[A-Z"“(]/.test(sentence)) return false;
  if (!/[.!?]["”)]?$/.test(sentence)) return false;
  if ((sentence.match(/•/g) ?? []).length > 1) return false;
  return !isAuthorLine(sentence) && !EMAIL.test(sentence);
}

/** Removes the leading "Abstract"/title words some PDFs glue to the first sentence. */
export function stripLeadingLabel(sentence: string): string {
  return sentence.replace(/^(abstract|summary|introduction)[\s:.—-]+/i, "").trim();
}

/** Short, clean label (heading, subject) or null when it looks like a fragment. */
export function cleanLabel(value: string): string | null {
  const label = collapse(value).replace(/^[•*\-–\d.)\s]+(?=[A-Za-z])/, "").replace(/[:\-–,;]+$/, "").trim();
  if (label.length < 2 || label.length > 70) return null;
  if (!/^[A-Z0-9]/.test(label)) return null;
  if (EMAIL.test(label) || URL.test(label) || isAuthorLine(label)) return null;
  if (/\b(the|of|and|to|for|a|an|in|with|on|by)$/i.test(label)) return null;
  return label;
}

export interface ArtifactReport {
  count: number;
  units: number;
  rate: number;
  kinds: string[];
}

/**
 * Counts presentation artifacts in an answer: glued "Abstract", author lists,
 * emails, inline bullet dumps, page-number lines, broken fragments, duplicates.
 */
export function detectArtifacts(text: string): ArtifactReport {
  const units = text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((unit) => unit.replace(/\[\d+\]/g, "").trim())
    .filter((unit) => unit.length > 0);
  const kinds: string[] = [];
  const seen = new Set<string>();
  for (const unit of units) {
    const plain = unit.replace(/^[-*]\s+|^\d+[.)]\s+/, "");
    if (/^abstract\b/i.test(plain) || /\babstract\s+we\b/i.test(plain)) kinds.push("abstract_label");
    else if (EMAIL.test(plain)) kinds.push("email");
    else if (isAuthorLine(plain)) kinds.push("author_list");
    else if ((plain.match(/•/g) ?? []).length >= 2) kinds.push("bullet_dump");
    else if (isPageNumberLine(plain)) kinds.push("page_number");
    else if (/^[a-z]/.test(plain) && plain.split(/\s+/).length <= 6 && !/[.!?:]$/.test(plain)) kinds.push("fragment");
    else if (/\w-\s+\w/.test(plain) && /[a-z]- [a-z]/.test(plain)) kinds.push("hyphen_break");
    const key = plain.toLowerCase();
    if (plain.length > 12 && seen.has(key)) kinds.push("duplicate");
    seen.add(key);
  }
  return { count: kinds.length, units: units.length, rate: units.length === 0 ? 0 : kinds.length / units.length, kinds };
}
