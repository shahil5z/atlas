import { resolveChunkOptions, type ChunkDocumentOptions } from "@/lib/chunking/chunk-options";
import type { DocumentChunk, DocumentPage, ParsedDocument } from "@/types/documents";

export type { ChunkDocumentOptions };

const BREAK_MARKERS = ["\n\n", "\n", ". ", "? ", "! ", " "] as const;

/**
 * Deterministic id from the document, page, order, and character span.
 * The same page text and options always produce the same id.
 */
export function createChunkId(
  documentId: string,
  pageNumber: number,
  index: number,
  characterStart: number,
  characterEnd: number,
): string {
  return `${documentId}:p${pageNumber}:c${index}:${characterStart}-${characterEnd}`;
}

function findChunkEnd(text: string, start: number, chunkSize: number): number {
  const hardEnd = Math.min(text.length, start + chunkSize);
  if (hardEnd >= text.length) return text.length;

  const minimum = start + Math.max(1, Math.floor(chunkSize * 0.5));
  const window = text.slice(start, hardEnd);

  for (const marker of BREAK_MARKERS) {
    const relative = window.lastIndexOf(marker);
    if (relative === -1) continue;
    const end = start + relative + marker.length;
    if (end >= minimum && end > start) return end;
  }

  return hardEnd;
}

function advanceStart(text: string, start: number, end: number, overlap: number): number {
  if (overlap <= 0) return end;

  let candidate = end - overlap;
  if (candidate <= start) return end;

  const previous = text[candidate - 1] ?? "";
  const current = text[candidate] ?? "";
  if (!/\s/.test(previous) && !/\s/.test(current)) {
    const relative = text.slice(candidate, end).search(/\s/);
    if (relative !== -1) {
      let snapped = candidate + relative;
      while (snapped < end && /\s/.test(text[snapped] ?? "")) snapped += 1;
      if (snapped > start && snapped < end) candidate = snapped;
    }
  }

  return candidate > start ? candidate : end;
}

function headingBefore(text: string, offset: number): string | null {
  const lines = text.slice(0, offset).split(/\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim() ?? "";
    if (line.length < 3 || line.length > 80) continue;
    if (/^[•*\-\d]/.test(line)) continue;
    if (/[.!?]$/.test(line)) continue;
    if (line.split(/\s+/).length > 10) continue;
    return line;
  }
  return null;
}

const MAJOR_HEADING = /^(?:(?:day|week|module|chapter|part|unit|lesson|section|step|session)\s+\d{1,3}\b.{0,60}|\d{1,2}\s+[A-Z][A-Za-z].{0,70}|[IVX]{1,4}\.\s+[A-Z].{0,70})$/i;

function isMajorHeading(line: string): boolean {
  const trimmed = line.trim();
  if (/^(abstract|introduction|references|bibliography|acknowledg(e)?ments|appendix|conclusions?|revision priorit(y|ies)|priorities|summary|key takeaways|final revision)$/i.test(trimmed)) return true;
  if (trimmed.length < 3 || trimmed.length > 80 || /[.!?,;]$/.test(trimmed)) return false;
  if (!MAJOR_HEADING.test(trimmed)) return false;
  // "12 Dan Hendrycks, ..." style reference lines are not headings.
  return trimmed.split(/\s+/).length <= 9 && !/[,/@]|http/i.test(trimmed);
}

/** Last major heading at or before `offset`, falling back to the carried section. */
export function sectionBefore(text: string, offset: number, carried: string | null): string | null {
  const lines = text.slice(0, offset).split(/\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim() ?? "";
    if (isMajorHeading(line)) return normalizeSection(line);
  }
  return carried;
}

function normalizeSection(line: string): string {
  const unit = line.match(/^(day|week|module|chapter|part|unit|lesson|section|step|session)\s+(\d{1,3})\b(.*)$/i);
  if (unit) {
    const word = (unit[1] ?? "").toLowerCase();
    const rest = (unit[3] ?? "").replace(/^[\s:–-]+/, "").trim();
    return `${word.charAt(0).toUpperCase()}${word.slice(1)} ${unit[2]}${rest ? `: ${rest}` : ""}`;
  }
  return line.trim();
}

/** Subject of a generic label: "Hard Topic" followed by "• Operating System" becomes "Operating System". */
function subjectAfter(text: string, heading: string, offset: number): string | null {
  const at = text.lastIndexOf(heading, offset);
  if (at === -1) return null;
  const next = text.slice(at + heading.length).split(/\n/).map((line) => line.trim()).find((line) => line.length > 0);
  const match = next?.match(/^[•*\-]\s*(.{2,60})$/);
  return match?.[1]?.trim() ?? null;
}

function plausibleSubheading(line: string): boolean {
  const words = line.split(/\s+/);
  if (words.length > 7 || !/^[A-Z]/.test(line) || /http|[@\[\]=+±%]/.test(line)) return false;
  if (/\b(the|of|and|to|for|a|an|in|with|on|by|is|are)$/i.test(line)) return false;
  return (line.match(/\d/g) ?? []).length <= 3;
}

/** Section label for a chunk: a span ("Days 1–3") when it covers several numbered units. */
function sectionForChunk(text: string, start: number, end: number, carried: string | null): string | null {
  const inside = text
    .slice(start, end)
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => isMajorHeading(line))
    .map(normalizeSection);
  const units = inside.map((label) => label.match(/^(Day|Week|Module|Chapter|Unit|Lesson|Step|Session) (\d+)$/)).filter(Boolean);
  const firstLine = text.slice(start, end).split(/\n/)[0]?.trim() ?? "";
  const carriedUnit = carried?.match(/^(Day|Week|Module|Chapter|Unit|Lesson|Step|Session) (\d+)$/);
  if (carriedUnit && !isMajorHeading(firstLine) && units.length >= 1) units.unshift(carriedUnit);
  if (units.length >= 2) {
    const first = units[0];
    const last = units[units.length - 1];
    return `${first?.[1]}s ${first?.[2]}–${last?.[2]}`;
  }
  const before = sectionBefore(text, start, carried);
  if (isMajorHeading(firstLine)) return normalizeSection(firstLine);
  return before ?? inside[0] ?? null;
}

function chunkPage(
  page: DocumentPage,
  documentId: string,
  options: ChunkDocumentOptions,
  state: { section: string | null; index: number } = { section: null, index: 0 },
): DocumentChunk[] {
  const text = page.text;
  if (text.trim().length === 0) return [];
  const carried = state.section;

  const chunks: DocumentChunk[] = [];
  let start = 0;
  let index = 0;
  let guard = 0;

  while (start < text.length && guard <= text.length) {
    guard += 1;
    if (text.slice(start).trim().length === 0) break;

    const end = findChunkEnd(text, start, options.chunkSize);
    let characterStart = start;
    let characterEnd = end;

    while (characterStart < characterEnd && /\s/.test(text[characterStart] ?? "")) {
      characterStart += 1;
    }
    while (characterEnd > characterStart && /\s/.test(text[characterEnd - 1] ?? "")) {
      characterEnd -= 1;
    }

    if (characterEnd > characterStart) {
      const rawNearest = headingBefore(text, characterEnd);
      const nearest = rawNearest && plausibleSubheading(rawNearest) ? rawNearest : null;
      const section = sectionForChunk(text, characterStart, characterEnd, carried);
      const subject = nearest && !isMajorHeading(nearest) ? subjectAfter(text, nearest, characterEnd) : null;
      const labelCount = text
        .slice(characterStart, characterEnd)
        .split(/\n/)
        .filter((line) => !/^[•*\-]/.test(line.trim()) && plausibleSubheading(line.trim()) && line.trim().split(/\s+/).length <= 3).length;
      const sub = labelCount > 2 ? null : nearest && !isMajorHeading(nearest) && !/^days? /i.test(section ?? "") ? (subject ?? nearest) : null;
      const heading = sub ?? section ?? nearest;
      chunks.push({
        chunkId: createChunkId(documentId, page.pageNumber, index, characterStart, characterEnd),
        documentId,
        pageNumber: page.pageNumber,
        text: text.slice(characterStart, characterEnd),
        characterStart,
        characterEnd,
        chunkIndex: state.index,
        ...(heading ? { heading } : {}),
        ...(section ?? heading ? { section: (section ?? heading) as string } : {}),
      });
      index += 1;
      state.index += 1;
    }

    if (end >= text.length) break;

    const next = advanceStart(text, start, end, options.overlap);
    if (next <= start) break;
    start = next;
  }

  state.section = sectionBefore(text, text.length, carried);
  return chunks;
}

/**
 * Splits each page independently. Chunks do not cross pages, so a later
 * retriever can cite `pageNumber` without reconstructing the PDF.
 */
export function chunkDocument(
  document: ParsedDocument,
  options?: Partial<ChunkDocumentOptions>,
): DocumentChunk[] {
  const resolved = resolveChunkOptions(options);
  const state = { section: null as string | null, index: 0 };
  return document.pages.flatMap((page) => chunkPage(page, document.id, resolved, state));
}
