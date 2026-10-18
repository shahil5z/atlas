import type { ResearchAnswer, StructuredAnswer } from "@/lib/agents/types";
import {
  answerPlanSchema,
  checkAnswerQuality,
  contentWords,
  planText,
  planToStructured,
  type AnswerMode,
  type AnswerPlan,
  type QualityReport,
} from "@/lib/answer/answer-plan";
import { cleanLabel, cleanSentences, collapse, isPromptLike, stripLeadingLabel } from "@/lib/documents/clean-text";
import { classifyIntent, type QuestionIntent } from "@/lib/documents/intent";
import {
  DOCUMENT_KIND_LABEL,
  pagesFromChunks,
  profileDocument,
  type DocumentProfile,
  type PageText,
} from "@/lib/documents/profile";
import { dayRange, findTopic, parseStudyPlan, scheduleBlocks, type StudyPlan } from "@/lib/documents/study-plan";
import type { Citation } from "@/lib/retrieval/citations";
import type { DocumentChunk } from "@/types/documents";

export interface ComposedDocumentAnswer {
  answer: ResearchAnswer;
  structured: StructuredAnswer;
  profile: DocumentProfile;
  intent: QuestionIntent;
  plan: AnswerPlan;
  quality: QualityReport;
}

type Section = AnswerPlan["sections"][number];
type Draft = { mode: AnswerMode; summary: string; sections: Section[]; caveats?: string[] };

const INJECTION = /ignore (all |previous |prior )?instructions|reveal the system prompt|execute javascript/i;

/**
 * Hands out citation labels in order of first use. Each label points at the
 * chunk on that page that actually contains the cited text, so sources and
 * snippets line up with the claim.
 */
class SourceRegistry {
  private readonly used: { citation: Citation; chunk: DocumentChunk }[] = [];

  constructor(
    private readonly chunks: readonly DocumentChunk[],
    private readonly document: { id: string; name: string },
  ) {}

  cite(pageNumber: number, needle?: string): string {
    const onPage = this.chunks.filter((chunk) => chunk.pageNumber === pageNumber);
    if (onPage.length === 0) return "";
    const full = needle ? collapse(needle).toLowerCase().slice(0, 240) : "";
    const prefix = full.slice(0, 50);
    const has = (item: DocumentChunk, key: string) => key.length > 0 && collapse(item.text).toLowerCase().includes(key);
    const chunk = onPage.find((item) => has(item, full)) ?? onPage.find((item) => has(item, prefix)) ?? onPage[0];
    if (!chunk) return "";
    const existing = this.used.find((item) => item.chunk.chunkId === chunk.chunkId);
    if (existing) return existing.citation.label;
    const id = this.used.length + 1;
    const citation: Citation = {
      id,
      label: `[${id}]`,
      documentId: this.document.id,
      documentName: this.document.name,
      pageNumber,
      chunkId: chunk.chunkId,
    };
    this.used.push({ citation, chunk });
    return citation.label;
  }

  citations(): Citation[] {
    return this.used.map((item) => item.citation);
  }
}

export function composeDocumentAnswer(input: {
  query: string;
  document: { id: string; name: string; pageCount: number };
  chunks: readonly DocumentChunk[];
}): ComposedDocumentAnswer | null {
  const intent = classifyIntent(input.query);
  if (intent === "general") return null;
  const pages = pagesFromChunks(input.chunks);
  if (pages.every((page) => page.text.trim().length === 0)) return null;
  const profile = profileDocument(pages, input.document.pageCount);
  const sources = new SourceRegistry(input.chunks, input.document);
  const draft = renderIntent(intent, input.query, profile, pages, sources);
  if (!draft) return null;
  const parsed = answerPlanSchema.safeParse({ ...draft, caveats: draft.caveats ?? [] });
  if (!parsed.success) return null;
  const plan = parsed.data;
  const citations = sources.citations();
  const text = planText(plan);
  const live = citations.filter((citation) => text.includes(citation.label));
  const quality = checkAnswerQuality({
    plan,
    query: input.query,
    validLabels: new Set(live.map((citation) => citation.id)),
    requireCitations: true,
  });
  if (!quality.ok) return null;
  const structured = planToStructured(plan);
  return {
    intent,
    profile,
    plan,
    quality,
    structured,
    answer: {
      answer: text,
      keyFindings: [],
      recommendations: [],
      caveats: [...plan.caveats, ...caveatsFor(profile)],
      citations: live,
      knowledgeSource: "document",
      termination: "sufficient",
      structured,
    },
  };
}

function renderIntent(
  intent: QuestionIntent,
  query: string,
  profile: DocumentProfile,
  pages: readonly PageText[],
  sources: SourceRegistry,
): Draft | null {
  const corpus = pages.map((page) => page.text).join("\n");
  if (INJECTION.test(corpus) && (intent === "document_overview" || intent === "document_summary")) {
    return {
      mode: "document_overview",
      summary: `This PDF contains text addressed to an AI assistant, asking it to ignore its instructions. Atlas treats that text as document content and does not follow it. ${sources.cite(pages[0]?.pageNumber ?? 1)}`.trim(),
      sections: [],
    };
  }
  if (intent === "structured_extraction" && /\b(total|amount|balance|invoice)/i.test(query)) return extractTotal(pages, sources);
  if (intent === "page") return pageSummary(query, pages, sources);
  if (intent === "comparison") return compareTopics(query, pages, sources);
  const drafted = answerForType(intent, query, profile, pages, sources);
  if (drafted) return drafted;
  if (OVERVIEW_INTENTS.includes(intent) || intent === "topics" || intent === "conclusions") return genericAnswer(intent, profile, pages, sources);
  return focusedAnswer(query, pages, sources);
}

function answerForType(
  intent: QuestionIntent,
  query: string,
  profile: DocumentProfile,
  pages: readonly PageText[],
  sources: SourceRegistry,
): Draft | null {
  switch (profile.estimatedDocumentType) {
    case "study_plan":
      return studyPlanAnswer(intent, query, profile, pages, sources);
    case "research_paper":
      return paperAnswer(intent, profile, pages, sources);
    case "resume":
      return resumeAnswer(intent, profile, pages, sources);
    case "invoice":
      return invoiceAnswer(intent, profile, pages, sources);
    case "legal":
      return legalAnswer(intent, profile, pages, sources);
    case "checklist":
      return checklistAnswer(intent, profile, pages, sources);
    default:
      return null;
  }
}

/** A direct reply for any document when the question names something in the text. */
function focusedAnswer(query: string, pages: readonly PageText[], sources: SourceRegistry): Draft | null {
  const asked = contentWords(query);
  if (asked.size === 0) return null;
  const hits: { text: string; pageNumber: number; overlap: number }[] = [];
  for (const page of pages) {
    for (const sentence of cleanSentences(page.text)) {
      if (isPromptLike(sentence)) continue;
      const words = new Set(contentWords(sentence));
      let overlap = 0;
      for (const word of asked) {
        if ([...words].some((item) => item === word || item.startsWith(word) || word.startsWith(item))) overlap += 1;
      }
      if (overlap > 0) hits.push({ text: easySentence(sentence), pageNumber: page.pageNumber, overlap });
    }
  }
  const ranked = unique(hits.sort((left, right) => right.overlap - left.overlap).map((hit) => `${hit.pageNumber}\u0000${hit.text}`))
    .map((key) => {
      const [page, text] = key.split("\u0000");
      return { pageNumber: Number(page), text: text ?? "" };
    })
    .filter((hit) => hit.text.length > 0);
  const lead = ranked[0];
  if (!lead) return null;
  const cite = sources.cite(lead.pageNumber, lead.text);
  return { mode: "specific_answer", summary: `${lead.text} ${cite}`.trim(), sections: [] };
}

const OVERVIEW_INTENTS: QuestionIntent[] = ["document_overview", "document_summary", "key_points"];

/* ---------------------------------------------------------------- study plan */

function studyPlanAnswer(
  intent: QuestionIntent,
  query: string,
  profile: DocumentProfile,
  pages: readonly PageText[],
  sources: SourceRegistry,
): Draft | null {
  const plan = parseStudyPlan(pages, profile.title);
  const firstPage = pages[0]?.pageNumber ?? 1;
  const blocks = scheduleBlocks(plan);
  const subjects = unique(blocks.map((block) => block.subject));

  if (intent === "specific_question" || intent === "fact_lookup") {
    const hit = findTopic(plan, query);
    if (!hit) return null;
    const isSubject = hit.topic === hit.track.subject;
    const others = hit.track.topics.filter((topic) => topic !== hit.topic).slice(0, 5);
    const label = sources.cite(hit.track.pageNumber, isSubject ? hit.track.subject : hit.topic);
    const lead = isSubject
      ? `${hit.topic} is the ${hit.kind} topic on Day ${hit.day.day}${others.length > 0 ? `, covering ${joinList(others)}` : ""}.`
      : `${hit.topic} is scheduled on Day ${hit.day.day}, as part of the ${hit.track.subject} ${hit.kind}-topic block${others.length > 0 ? `, alongside ${joinList(others)}` : ""}.`;
    const easy = hit.kind === "hard" && hit.day.easy?.subject
      ? ` The lighter topic that day is ${joinList([hit.day.easy.subject, ...hit.day.easy.topics].slice(0, 3))}.`
      : "";
    return { mode: "specific_answer", summary: `${lead}${easy} ${label}`.trim(), sections: [] };
  }

  if (intent === "recommendation" || (intent === "structured_extraction" && /priorit/i.test(query))) {
    if (plan.priorities.length === 0) return null;
    const top = plan.priorities[0];
    if (!top) return null;
    const label = sources.cite(top.pageNumber, "Priority 1");
    const rest = plan.priorities.slice(1);
    return {
      mode: "recommendation",
      summary: `The highest-priority subjects for revision are ${joinList(top.subjects)}. ${label}`,
      sections: [
        { heading: `Priority ${top.rank}`, paragraphs: [], bullets: top.subjects.map((subject, index) => `${index + 1}. ${subject}`) },
        ...(rest.length > 0
          ? [{ heading: "Then, in order", paragraphs: [], bullets: rest.map((item, index) => `${index + 1}. ${joinList(item.subjects)} (Priority ${item.rank})`) }]
          : []),
      ],
    };
  }

  if (intent === "topics" || intent === "structured_extraction") {
    if (blocks.length === 0) return null;
    return {
      mode: "list",
      summary: `The plan covers ${subjects.length} main subjects, in this order: ${sources.cite(blocks[0]?.pageNumber ?? firstPage, blocks[0]?.subject)}`,
      sections: [{ heading: "", paragraphs: [], bullets: blocks.map((block, index) => `${index + 1}. ${block.subject} (${dayRange(block)})`) }],
    };
  }

  // Overview, summary, key points, conclusions.
  const duration = plan.duration;
  const exam = plan.exam ?? plan.title;
  const identity = duration
    ? `This is a ${duration}-day study roadmap${exam ? ` for ${exam}` : ""}.`
    : `This is a study plan${exam ? ` for ${exam}` : ""}.`;
  const purpose = plan.purpose ? describeAsItself(plan.purpose.text) : "";
  const structure = plan.days.some((day) => day.hard && day.easy)
    ? "Each day pairs one hard topic with a lighter one"
    : "It works through the material day by day";
  const ending = plan.priorities.length > 0 ? ", and it ends with a revision priority list." : ".";
  const summary = `${identity}${purpose ? ` ${purpose}` : ""} ${structure}${ending} ${sources.cite(firstPage, plan.title ?? undefined)}`.replace(/\s+/g, " ").trim();
  if (intent === "conclusions") {
    return { mode: "document_summary", summary, sections: takeaway(plan, blocks, sources) };
  }

  const sections: Section[] = [];
  if (subjects.length > 0) {
    const easySamples = unique(
      plan.days.filter((_, index, all) => index % Math.max(1, Math.floor(all.length / 4)) === 0).map((day) => day.easy?.subject ?? ""),
    )
      .filter(Boolean)
      .slice(0, 4);
    sections.push({
      heading: "What it covers",
      paragraphs: [
        `The hard-topic track works through ${joinList(subjects)}.${easySamples.length > 0 ? ` The lighter track mixes in topics such as ${joinList(easySamples)}.` : ""}`,
      ],
      bullets: [],
    });
  }
  const organized: string[] = [];
  if (plan.routine && plan.routine.items.length > 0) {
    organized.push(`Daily routine: ${joinList(plan.routine.items.map(routineItem))} ${sources.cite(plan.routine.pageNumber, "Daily Routine")}`.trim());
  }
  for (const block of blocks) {
    organized.push(`${dayRange(block)}: ${block.subject} ${sources.cite(block.pageNumber, block.subject)}`.trim());
  }
  if (organized.length > 0) sections.push({ heading: "How it is organized", paragraphs: [], bullets: organized.slice(0, 12) });
  if (plan.priorities.length > 0) {
    const first = plan.priorities[0];
    sections.push({
      heading: "Revision priorities",
      paragraphs: [`Subjects are ranked for revision from Priority 1 to Priority ${plan.priorities.length}. ${sources.cite(first?.pageNumber ?? firstPage, "Priority 1")}`.trim()],
      bullets: plan.priorities.map((item, index) => `${index + 1}. ${joinList(item.subjects)}`),
    });
  }
  sections.push(...takeaway(plan, blocks, null));
  return { mode: intent === "document_overview" ? "document_overview" : "document_summary", summary, sections };
}

function takeaway(plan: StudyPlan, blocks: ReturnType<typeof scheduleBlocks>, sources: SourceRegistry | null): Section[] {
  const top = plan.priorities[0];
  if (top) {
    const keys = top.subjects.map((subject) => subject.toLowerCase());
    const days = blocks
      .filter((block) => keys.includes(block.subject.toLowerCase()))
      .reduce((total, block) => total + block.to - block.from + 1, 0);
    const share = days > 0 && plan.duration ? ` and together take ${days} of the ${plan.duration} study days` : "";
    const label = sources ? ` ${sources.cite(top.pageNumber, "Priority 1")}` : "";
    return [{ heading: "Key takeaway", paragraphs: [`Focus first on ${joinList(top.subjects)}: they are the top revision priority${share}.${label}`], bullets: [] }];
  }
  const longest = [...blocks].sort((left, right) => right.to - right.from - (left.to - left.from))[0];
  if (!longest) return [];
  return [{ heading: "Key takeaway", paragraphs: [`${longest.subject} gets the longest block, ${dayRange(longest)}.`], bullets: [] }];
}

function routineItem(item: string): string {
  const match = item.match(/^([^:]+):\s*(.+)$/);
  if (!match) return item;
  const label = (match[1] ?? "").trim();
  const value = (match[2] ?? "").trim().replace(/(\d)\s*-\s*(\d)/g, "$1–$2");
  if (/\b(hours?|minutes?|mins?)\b/i.test(value)) return `${value.toLowerCase()} of ${lowerFirst(label)}`;
  return `${value} ${label}`;
}

function describeAsItself(sentence: string): string {
  const clean = stripLeadingLabel(sentence).replace(/\.$/, "");
  if (/\b(is|are|was|will|helps?|covers|provides)\b/i.test(clean.split(/\s+/).slice(0, 3).join(" "))) return `${clean}.`;
  return `It describes itself as a ${lowerFirst(clean)}.`;
}

/* ------------------------------------------------------------ research paper */

function paperAnswer(
  intent: QuestionIntent,
  profile: DocumentProfile,
  pages: readonly PageText[],
  sources: SourceRegistry,
): Draft | null {
  if (!OVERVIEW_INTENTS.includes(intent) && intent !== "conclusions") return null;
  const abstract = blockAfter(pages, /^abstract\b/i);
  const conclusion = blockAfter(pages, /^(\d+\.?\s+)?(conclusions?|discussion|concluding remarks)\b/i);
  const abstractSentences = abstract
    ? cleanSentences(abstract.text).map(stripLeadingLabel).filter((sentence) => !isPromptLike(sentence))
    : [];
  const title = profile.title && cleanLabel(profile.title) ? profile.title : null;
  const firstPage = pages[0]?.pageNumber ?? 1;

  const opening = abstractSentences[0];
  if (!opening) {
    const explained = explainDocument(intent, profile, pages, sources);
    if (explained) return explained;
  }
  const abstractCite = abstract ? sources.cite(abstract.pageNumber, opening?.trim()) : sources.cite(firstPage);
  let summary: string;
  if (opening && /^We (introduce|present|propose|describe|study|investigate)\b/.test(opening)) {
    summary = `This research paper ${opening.replace(/^We (\w+)/, (_, verb: string) => `${verb}s`).replace(/^(\w+)ss\b/, "$1s")}`;
  } else if (opening) {
    summary = `This is a research paper${title ? ` titled “${title}”` : ""}. ${thirdPerson(opening)}`;
  } else {
    summary = `This is a research paper${title ? ` titled “${title}”` : ""}.`;
  }
  summary = `${summary} ${abstractCite}`.trim();

  const sections: Section[] = [];
  const used = new Set([opening]);
  const approach = abstractSentences.find((sentence) => !used.has(sentence) && /\b(leverag|we use|uses|based on|approach|method|architecture|framework|technique)/i.test(sentence));
  if (approach) {
    used.add(approach);
    sections.push({ heading: "Approach", paragraphs: [`${thirdPerson(approach)} ${sources.cite(abstract?.pageNumber ?? firstPage, approach.trim())}`.trim()], bullets: [] });
  }
  const findings = abstractSentences.filter((sentence) => !used.has(sentence) && /\b(outperform|achiev|surpass|improv|results?|show|demonstrat|find)/i.test(sentence)).slice(0, 2);
  if (findings.length > 0) {
    sections.push({
      heading: "Findings",
      paragraphs: [],
      bullets: findings.map((sentence) => `${thirdPerson(sentence)} ${sources.cite(abstract?.pageNumber ?? firstPage, sentence.trim())}`.trim()),
    });
  }
  const outline = unique(
    pages
      .flatMap((page) => page.text.split(/\n/))
      .map((line) => line.trim())
      .filter((line) => /^\d{1,2}\s+[A-Z][A-Za-z-]+(\s+[A-Za-z-]+){0,6}$/.test(line) && !/,/.test(line))
      .map((line) => cleanLabel(line.replace(/^\d+\s+/, "")))
      .filter((text): text is string => Boolean(text)),
  ).slice(0, 8);
  if (outline.length >= 3 && intent !== "conclusions") {
    sections.push({ heading: "How it is organized", paragraphs: [`The paper is organized into ${outline.length} sections: ${joinList(outline)}.`], bullets: [] });
  }
  const closing = conclusion ? cleanSentences(conclusion.text)[0] : null;
  if (closing) {
    sections.push({ heading: intent === "conclusions" ? "Conclusion" : "Key takeaway", paragraphs: [`${conclusionLine(closing)} ${sources.cite(conclusion?.pageNumber ?? firstPage, closing.trim())}`.trim()], bullets: [] });
  }
  if (!opening && sections.length === 0) return null;
  return { mode: intent === "document_overview" ? "document_overview" : "document_summary", summary, sections };
}

function thirdPerson(sentence: string): string {
  return sentence
    .replace(/^We\b/, "The authors")
    .replace(/^Our (model|models|work|method|approach|results)\b/, (_, noun: string) => `The ${noun}`)
    .replace(/\bwe\b/g, "the authors")
    .replace(/\bour\b/g, "their");
}

function conclusionLine(sentence: string): string {
  const that = sentence.match(/\b(?:demonstrates?|shows?|suggests?|finds?|indicates?)\s+that\s+(.+)$/i);
  if (that?.[1]) return `The authors conclude that ${that[1]}`;
  return thirdPerson(sentence);
}

/* -------------------------------------------------------------------- resume */

function resumeAnswer(intent: QuestionIntent, profile: DocumentProfile, pages: readonly PageText[], sources: SourceRegistry): Draft | null {
  if (!OVERVIEW_INTENTS.includes(intent) && intent !== "topics") return null;
  const blocks = sectionBlocks(pages, /^(experience|work experience|education|skills|technical skills|projects|certifications|summary|awards)\b/i);
  const name = profile.title && cleanLabel(profile.title) && !/resume|curriculum/i.test(profile.title) ? profile.title : null;
  const present = blocks.map((block) => block.heading.toLowerCase());
  const firstPage = pages[0]?.pageNumber ?? 1;
  const summary = `This is the resume of ${name ?? "a candidate"}${present.length > 0 ? `, with sections on ${joinList(unique(present))}` : ""}. ${sources.cite(firstPage, name ?? undefined)}`.trim();
  const sections = blocks.slice(0, 4).map((block) => ({
    heading: block.heading,
    paragraphs: [],
    bullets: block.lines.slice(0, intent === "topics" ? 4 : 6).map((line, index) => (index === 0 ? `${line} ${sources.cite(block.pageNumber, line)}`.trim() : line)),
  }));
  return { mode: intent === "document_overview" ? "document_overview" : "document_summary", summary, sections };
}

/* ------------------------------------------------------------------- invoice */

function invoiceAnswer(intent: QuestionIntent, profile: DocumentProfile, pages: readonly PageText[], sources: SourceRegistry): Draft | null {
  if (!OVERVIEW_INTENTS.includes(intent)) return genericAnswer(intent, profile, pages, sources);
  const fields: [string, RegExp][] = [
    ["Invoice number", /invoice\s*(?:no\.?|number|#)?\s*[:#]?\s*([A-Z0-9-]{2,})/i],
    ["Date", /\b(?:invoice\s+)?date\s*[:\-]?\s*([\w ,/.-]{6,20})/i],
    ["Bill to", /\bbill(?:ed)?\s+to\s*[:\-]?\s*(.{3,60})/i],
    ["Due date", /\bdue\s+date\s*[:\-]?\s*([\w ,/.-]{6,20})/i],
    ["Amount due", /\b(?:grand\s+total|amount\s+due|balance\s+due|total)\s*[:\-]?\s*([$€£₹]?\s?\d[\d,]*(?:\.\d{2})?)/i],
  ];
  const rows: string[][] = [];
  let firstLabel = "";
  for (const [label, pattern] of fields) {
    for (const page of pages) {
      const match = page.text.match(pattern);
      if (!match?.[1]) continue;
      const cite = sources.cite(page.pageNumber, match[0]);
      if (!firstLabel) firstLabel = cite;
      rows.push([label, `${match[1].trim()}`]);
      break;
    }
  }
  const amount = rows.find((row) => row[0] === "Amount due")?.[1];
  return {
    mode: "document_overview",
    summary: `This is an invoice${amount ? ` for ${amount}` : ""}. ${firstLabel || sources.cite(pages[0]?.pageNumber ?? 1)}`.trim(),
    sections: rows.length > 0 ? [{ heading: "Details found", paragraphs: [], bullets: [], table: { headers: ["Field", "Value"], rows } }] : [],
  };
}

/* --------------------------------------------------------------------- legal */

function legalAnswer(intent: QuestionIntent, profile: DocumentProfile, pages: readonly PageText[], sources: SourceRegistry): Draft | null {
  if (!OVERVIEW_INTENTS.includes(intent)) return null;
  const corpus = pages.map((page) => page.text).join("\n");
  const kind = corpus.match(/\b(non-disclosure agreement|service agreement|employment agreement|lease agreement|license agreement|agreement|contract|terms of service|policy)\b/i)?.[1];
  const headings = outlineOf(profile).slice(0, 8);
  return {
    mode: "document_overview",
    summary: `This appears to be a legal document${kind ? ` (${kind.toLowerCase()})` : ""}. Atlas describes its structure only; this is not legal advice. ${sources.cite(pages[0]?.pageNumber ?? 1)}`.trim(),
    sections: headings.length > 0 ? [{ heading: "Sections in the document", paragraphs: [], bullets: headings }] : [],
  };
}

/* ----------------------------------------------------------------- checklist */

function checklistAnswer(intent: QuestionIntent, profile: DocumentProfile, pages: readonly PageText[], sources: SourceRegistry): Draft | null {
  if (!OVERVIEW_INTENTS.includes(intent) && intent !== "structured_extraction" && intent !== "topics") return genericAnswer(intent, profile, pages, sources);
  const items: { text: string; pageNumber: number }[] = [];
  for (const page of pages) {
    for (const line of page.text.split(/\n+/)) {
      const match = line.trim().match(/^(?:[•*\-]|\[ ?x?\]|☐|✓|\d+[.)])\s*(.+)$/i);
      const label = match?.[1] ? cleanLabel(match[1]) : null;
      if (label) items.push({ text: label, pageNumber: page.pageNumber });
    }
  }
  if (items.length === 0) return genericAnswer(intent, profile, pages, sources);
  const title = profile.title && cleanLabel(profile.title);
  return {
    mode: "list",
    summary: `This is a checklist${title ? ` titled “${title}”` : ""} with ${items.length} items. ${sources.cite(items[0]?.pageNumber ?? 1, items[0]?.text)}`.trim(),
    sections: [{ heading: "Items", paragraphs: [], bullets: items.slice(0, 14).map((item) => item.text) }],
  };
}

/* --------------------------------------------------------------- sectioned report */

interface ReportSection {
  heading: string;
  pageNumber: number;
  lines: string[];
}

/**
 * Turns a PDF that is already split into headed sections into a short
 * explanation: one subheading per section, with a few plain-English points.
 * Instruction text inside the file ("please provide the subtopics") is skipped.
 */
function explainDocument(
  intent: QuestionIntent,
  profile: DocumentProfile,
  pages: readonly PageText[],
  sources: SourceRegistry,
): Draft | null {
  if (!OVERVIEW_INTENTS.includes(intent) && intent !== "topics" && intent !== "conclusions") return null;
  const found = reportSections(pages);
  if (found.length < 2) return null;

  const titled = found
    .map((section) => ({ ...section, title: sectionTitle(section.heading) }))
    .filter((section) => section.title.length > 0);
  const withPoints = spread(
    titled
      .map((section) => ({
        heading: section.title,
        pageNumber: section.pageNumber,
        bullets: sectionPoints(section.lines, section.heading),
      }))
      .filter((section) => section.bullets.length > 0 && !/^conclusion$/i.test(section.heading)),
    4,
  );
  if (withPoints.length < 2) return null;

  const topic = sharedTopic(found.map((section) => section.heading));
  const subject = topic ? `${/^[aeiou]/i.test(topic) ? "an" : "the"} ${topic}` : "this document";
  const names = withPoints.slice(0, 4).map((section) => lowerFirst(section.heading));
  const cite = sources.cite(withPoints[0]?.pageNumber ?? pages[0]?.pageNumber ?? 1, found[0]?.heading);
  const direct =
    intent === "topics"
      ? `The main topics are ${joinList(names)}.`
      : intent === "conclusions"
        ? `The document closes on ${lowerFirst(withPoints[withPoints.length - 1]?.heading ?? "its last section")}.`
        : `This PDF is about ${subject}.`;
  const summary = `${direct} ${cite}`.replace(/\s+/g, " ").trim();
  const draft = withinBudget({
    mode: intent === "topics" ? "list" : intent === "document_summary" || intent === "conclusions" ? "document_summary" : "document_overview",
    summary,
    sections: withPoints.map((section) => ({ heading: section.heading, paragraphs: [], bullets: section.bullets })),
  });
  return draft.sections.length >= 2 ? draft : null;
}

function reportSections(pages: readonly PageText[]): ReportSection[] {
  const sections: ReportSection[] = [];
  for (const page of pages) {
    for (const raw of page.text.split(/\n+/)) {
      const line = raw.trim();
      if (!line) continue;
      const heading = sectionTitleFromLine(line);
      if (heading) {
        const previous = sections[sections.length - 1];
        if (previous && normalize(previous.heading) === normalize(heading)) continue;
        sections.push({ heading, pageNumber: page.pageNumber, lines: [] });
        continue;
      }
      if (sections.length > 0 && !isPromptLike(line)) sections[sections.length - 1]?.lines.push(line);
    }
  }
  return sections;
}

function sectionTitleFromLine(line: string): string | null {
  const marked = markdownHeading(line);
  if (marked && isUsefulSection(marked)) return marked;
  const numbered = line.match(/^\d{1,2}[.)]\s+([A-Z][^.]{8,70})$/);
  const title = numbered?.[1]?.replace(/\*\*/g, "").trim();
  if (!title || /:\s+\S+\s+\S+/.test(title) || /\b(is|are|was|were|has|have|will|must)\b/i.test(title)) return null;
  return isUsefulSection(title) ? title : null;
}

function markdownHeading(line: string): string | null {
  const marked = line.match(/^#{1,6}\s+(.{3,110})$/);
  if (!marked?.[1]) return null;
  return marked[1].replace(/\*\*/g, "").replace(/^\d{1,2}[.)]\s+/, "").trim();
}

function isUsefulSection(title: string): boolean {
  if (isPromptLike(title)) return false;
  if (/^(research report|introduction|contents|table of contents|overview|conclusion)$/i.test(title)) return false;
  if (/^here are\b/i.test(title)) return false;
  const words = title.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return true;
  return title.length >= 4;
}

function sectionTitle(heading: string): string {
  const [leftRaw, rightRaw] = heading.split(/\s*:\s*/);
  const left = (leftRaw ?? heading).trim();
  const right = rightRaw?.trim();
  const rightWords = right ? right.split(/\s+/).length : 99;
  const chosen = /^introduction to\b/i.test(left) && right && rightWords <= 8 ? right : left;
  return sentenceCase(chosen.split(/\s+/).slice(0, 10).join(" "));
}

function sentenceCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      if (/[A-Z]{2,}/.test(word) || /\d/.test(word)) return word;
      const lower = word.toLowerCase();
      return index === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(" ");
}

function sectionPoints(lines: readonly string[], heading: string): string[] {
  const points: string[] = [];
  for (const block of reflow(lines)) {
    if (isPromptLike(block) || isLabelOnly(block)) continue;
    const sentences = cleanSentences(block).map(easySentence);
    if (sentences.length > 0) points.push(...sentences);
    else {
      const point = easySentence(block.replace(/\*\*/g, "").replace(/^[*-]\s+/, "").replace(/^\d+[.)]\s+/, ""));
      if (saysSomething(point)) points.push(point);
    }
  }
  const useful = points.filter((point) => saysSomething(point) && !sameAsHeading(point, heading) && !/given topic/i.test(point) && !/\b(following|as follows)\b/i.test(point));
  const best = [...useful].sort((left, right) => factScore(right) - factScore(left))[0];
  return best ? [best] : [];
}

function storyScore(point: string): number {
  let score = 0;
  if (/\b(is|are|designed|expected)\b/i.test(point)) score += 2;
  if (/^(this|these|it|they)\b/i.test(point)) score -= 2;
  if (/^[^:]{0,48}:\s/.test(point)) score -= 2;
  return score;
}

function factScore(point: string): number {
  let score = storyScore(point);
  if (/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d+(?:\.\d+)?\s*(?:w|watts?|fps|gb|tflops|%)\b/i.test(point)) score += 4;
  if (/\b(cores?|watts?|fps|gb|tflops|\$|price|pricing)\b/i.test(point)) score += 2;
  return score;
}

function spread<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) return [...items];
  const last = items.length - 1;
  const indexes = new Set<number>([0, last]);
  if (max > 2) indexes.add(1);
  if (max > 3) indexes.add(Math.min(3, last - 1));
  return [...indexes]
    .sort((left, right) => left - right)
    .slice(0, max)
    .map((index) => items[index])
    .filter((item): item is T => Boolean(item));
}

/** Joins PDF line wraps, while keeping each list item as its own block. */
function reflow(lines: readonly string[]): string[] {
  const blocks: string[] = [];
  let current = "";
  for (const line of lines) {
    if (isLabelOnly(line)) {
      if (current) blocks.push(current);
      current = "";
      continue;
    }
    if (/^(?:\d+[.)]|[*-])\s+/.test(line)) {
      if (current) blocks.push(current);
      current = line;
      continue;
    }
    current = current ? `${current} ${line}` : line;
  }
  if (current) blocks.push(current);
  return blocks.map((block) => collapse(block));
}

function isLabelOnly(line: string): boolean {
  const plain = collapse(line.replace(/\*\*/g, "").replace(/:$/, ""));
  const words = plain.split(/\s+/);
  if (words.length < 2 || words.length > 18) return false;
  if (/[.!?]|^(?:\d+[.)]|[*-])\s+/.test(plain)) return false;
  if (!/^[A-Z*]/.test(line.trim())) return false;
  return !/\b(is|are|has|have|includes|uses|supports)\b/i.test(plain);
}

function saysSomething(text: string): boolean {
  return text.length >= 28 && !isPromptLike(text) && !/:\s*\.?$/.test(text) && /\b(is|are|was|were|has|have|includes?|uses?|supports?|designed|expected|offers?|provides?|makes|can|will|features)\b/i.test(text);
}

function easySentence(sentence: string): string {
  const easy = collapse(sentence)
    .replace(/\ba forthcoming\b/gi, "an upcoming")
    .replace(/\bforthcoming\b/gi, "upcoming")
    .replace(/\bwill likely\b/gi, "is expected to")
    .replace(/\butilizes\b/gi, "uses")
    .replace(/\bleverages\b/gi, "uses")
    .replace(/\bincorporates\b/gi, "includes")
    .replace(/\ba cutting-edge\b/gi, "an advanced")
    .replace(/\bcutting-edge\b/gi, "advanced");
  if (/:\s*$/.test(easy)) return "";
  const words = easy.split(/\s+/);
  const clipped = words.length > 32 ? `${words.slice(0, 32).join(" ").replace(/[,:;]+$/, "")}…` : easy;
  if (/:\s*$/.test(clipped)) return "";
  return /[.!?…]$/.test(clipped) ? clipped : `${clipped}.`;
}

function sameAsHeading(point: string, heading: string): boolean {
  const left = normalize(point);
  const right = normalize(heading);
  return left === right || left.startsWith(right) || right.startsWith(left);
}

function sharedTopic(headings: readonly string[]): string | null {
  const counts = new Map<string, { n: number; display: string }>();
  for (const heading of headings) {
    const seen = new Set<string>();
    for (const match of heading.matchAll(/\b([A-Z][\w.+-]*(?:\s+[A-Z0-9][\w.+-]*){0,3})\b/g)) {
      const display = (match[1] ?? "").replace(/['’]s$/, "");
      if (display.length < 5) continue;
      if (/^(Introduction|Overview|Performance|Market|Power|Advanced|Evaluating|Thermal|Design|Features|Applications|Specifications)$/.test(display)) continue;
      const key = display.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const row = counts.get(key) ?? { n: 0, display };
      row.n += 1;
      counts.set(key, row);
    }
  }
  const best = [...counts.values()]
    .filter((row) => row.n >= 2 || (row.n >= 1 && /\d/.test(row.display) && row.display.includes(" ")))
    .sort((left, right) => right.n - left.n || right.display.length - left.display.length)[0];
  return best?.display ?? null;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function withinBudget(draft: Draft, limit = 240): Draft {
  const sections = draft.sections.map((section) => ({ ...section, bullets: [...section.bullets] }));
  const words = () =>
    [draft.summary, ...sections.flatMap((section) => [section.heading, ...section.paragraphs, ...section.bullets])]
      .join(" ")
      .split(/\s+/)
      .filter(Boolean).length;
  while (words() > limit && sections.length > 0) {
    const last = sections[sections.length - 1];
    if (last && last.bullets.length > 1) last.bullets.pop();
    else sections.pop();
  }
  return { ...draft, sections };
}

/* ------------------------------------------------------------------- generic */

function genericAnswer(intent: QuestionIntent, profile: DocumentProfile, pages: readonly PageText[], sources: SourceRegistry): Draft | null {
  if (!OVERVIEW_INTENTS.includes(intent) && intent !== "topics" && intent !== "conclusions") return null;
  const explained = explainDocument(intent, profile, pages, sources);
  if (explained) return explained;
  const firstPage = pages[0]?.pageNumber ?? 1;
  const intro = pages
    .flatMap((page) => cleanSentences(page.text).map((text) => ({ text, pageNumber: page.pageNumber })))
    .filter((sentence) => !isPromptLike(sentence.text))
    .slice(0, 2);
  const outline = outlineOf(profile);
  const title = profile.title ? cleanLabel(profile.title) : null;
  const confident = profile.typeConfidence !== "low" && profile.estimatedDocumentType !== "general";
  const kind = DOCUMENT_KIND_LABEL[profile.estimatedDocumentType];
  const pagesNote = `${profile.pageCount} page${profile.pageCount === 1 ? "" : "s"}`;
  const identity = confident
    ? `This is a ${kind}${title ? ` titled “${title}”` : ""} (${pagesNote}).`
    : title
      ? `This ${pagesNote} PDF is titled “${title}”.`
      : `This is a ${pagesNote} PDF.`;
  const lead = intro[0];
  const about = lead ? ` ${thirdPerson(stripLeadingLabel(lead.text))}` : outline.length > 0 ? ` It covers ${joinList(outline.slice(0, 4).map(lowerFirst))}.` : "";
  const summary = `${identity}${about} ${sources.cite(lead?.pageNumber ?? firstPage, lead?.text.trim())}`.trim();
  const sections: Section[] = [];
  if (outline.length >= 2) sections.push({ heading: intent === "conclusions" ? "Closing sections" : "What it covers", paragraphs: [], bullets: outline.slice(0, 8) });
  const second = intro[1];
  if (second && intent !== "topics" && outline.length < 2) {
    sections.push({ heading: "", paragraphs: [`${thirdPerson(second.text)} ${sources.cite(second.pageNumber, second.text.trim())}`.trim()], bullets: [] });
  }
  if (!lead && outline.length === 0) return null;
  return { mode: intent === "document_overview" ? "document_overview" : intent === "topics" ? "list" : "document_summary", summary, sections };
}

function outlineOf(profile: DocumentProfile): string[] {
  return unique(
    profile.headings
      .filter((heading) => heading.text !== profile.title)
      .map((heading) => cleanLabel(heading.text.replace(/^\d+(\.\d+)*\.?\s+/, "")))
      .filter((text): text is string => Boolean(text) && !/^(abstract|contents|references|page \d+)$/i.test(text ?? "")),
  );
}

/* ------------------------------------------------------- narrow deterministic */

function extractTotal(pages: readonly PageText[], sources: SourceRegistry): Draft | null {
  const labeled = pages.flatMap((page) =>
    page.text.split(/\n+/).flatMap((line) => {
      const match = line.match(/(grand\s+total|amount\s+due|balance\s+due|total)\s*[:\-]?\s*([$€£₹]?\s?\d[\d,]*(?:\.\d{2})?)/i);
      if (!match?.[2]) return [];
      return [{ amount: match[2].trim(), label: match[1] ?? "Total", pageNumber: page.pageNumber, line: line.trim() }];
    }),
  );
  const best = labeled.find((item) => /grand|amount due|balance/i.test(item.label)) ?? labeled.at(-1);
  if (!best) return null;
  return {
    mode: "extraction",
    summary: `The ${best.label.toLowerCase().replace(/\s+/g, " ")} is ${best.amount}. ${sources.cite(best.pageNumber, best.line)}`.trim(),
    sections: [],
  };
}

function pageSummary(query: string, pages: readonly PageText[], sources: SourceRegistry): Draft | null {
  const number = Number(query.match(/\bpage\s+(\d+)\b/i)?.[1]);
  const page = pages.find((item) => item.pageNumber === number);
  if (!page) return null;
  const sentences = cleanSentences(page.text);
  const lines = page.text
    .split(/\n+/)
    .map((line) => cleanLabel(line))
    .filter((line): line is string => Boolean(line))
    .slice(0, 6);
  const lead = sentences[0] ? `Page ${number} begins: ${sentences.slice(0, 2).join(" ")}` : `Page ${number} contains these items.`;
  return {
    mode: "page_summary",
    summary: `${lead} ${sources.cite(number)}`.trim(),
    sections: !sentences[0] && lines.length > 0 ? [{ heading: "", paragraphs: [], bullets: lines }] : [],
  };
}

function compareTopics(query: string, pages: readonly PageText[], sources: SourceRegistry): Draft | null {
  const parts = query
    .replace(/^(compare|what is the difference between)\s+/i, "")
    .replace(/[?.]$/, "")
    .split(/\band\b|\bvs\.?\b|\bversus\b|\bwith\b/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 2);
  if (parts.length < 2) return null;
  const find = (term: string) => {
    for (const page of pages) {
      const sentence = cleanSentences(page.text).find((item) => item.toLowerCase().includes(term.toLowerCase()));
      if (sentence) return { line: sentence, pageNumber: page.pageNumber };
    }
    return null;
  };
  const left = find(parts[0] ?? "");
  const right = find(parts[1] ?? "");
  if (!left || !right) return null;
  return {
    mode: "comparison",
    summary: `The document discusses both ${parts[0]} and ${parts[1]}.`,
    sections: [
      { heading: parts[0] ?? "First", paragraphs: [`${left.line} ${sources.cite(left.pageNumber, left.line)}`], bullets: [] },
      { heading: parts[1] ?? "Second", paragraphs: [`${right.line} ${sources.cite(right.pageNumber, right.line)}`], bullets: [] },
    ],
  };
}

/* ------------------------------------------------------------------- helpers */

function sectionBlocks(pages: readonly PageText[], marker: RegExp): { heading: string; lines: string[]; pageNumber: number }[] {
  const blocks: { heading: string; lines: string[]; pageNumber: number }[] = [];
  for (const page of pages) {
    for (const line of page.text.split(/\n+/).map((item) => item.trim()).filter(Boolean)) {
      if (marker.test(line) && line.length < 40) {
        blocks.push({ heading: cleanLabel(line) ?? line, lines: [], pageNumber: page.pageNumber });
      } else if (blocks.length > 0) {
        const label = collapse(line.replace(/^[•*\-]\s*/, ""));
        if (label) blocks[blocks.length - 1]?.lines.push(label);
      }
    }
  }
  return blocks;
}

/** Text after a heading line, up to the next numbered heading. */
function blockAfter(pages: readonly PageText[], marker: RegExp): { text: string; pageNumber: number } | null {
  for (const page of pages) {
    const lines = page.text.split(/\n/).map((line) => line.trim());
    const index = lines.findIndex((line) => marker.test(line) && line.length < 60);
    if (index === -1) continue;
    const inline = lines[index]?.replace(marker, "").replace(/^[\s:.—-]+/, "") ?? "";
    const rest: string[] = inline.length > 20 ? [inline] : [];
    for (const line of lines.slice(index + 1)) {
      if (/^(\d+\.?\s+[A-Z]|acknowledg|references)/i.test(line) && line.length < 80) break;
      rest.push(line);
    }
    const text = rest.join("\n");
    if (text.length > 40) return { text, pageNumber: page.pageNumber };
  }
  return null;
}

function caveatsFor(profile: DocumentProfile): string[] {
  const notes: string[] = [];
  if (profile.capabilityNote) notes.push(profile.capabilityNote);
  return notes;
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function joinList(values: readonly string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}

function lowerFirst(value: string): string {
  if (/^[A-Z]{2,}/.test(value) || /^[A-Z][a-z]*[A-Z]/.test(value)) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}
