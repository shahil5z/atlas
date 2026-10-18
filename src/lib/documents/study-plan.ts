import { cleanLabel, cleanSentences } from "@/lib/documents/clean-text";
import type { PageText } from "@/lib/documents/profile";

export interface StudyTrack {
  subject: string;
  topics: string[];
  pageNumber: number;
}

export interface StudyDay {
  day: number;
  pageNumber: number;
  hard: StudyTrack | null;
  easy: StudyTrack | null;
}

export interface StudyPriority {
  rank: number;
  subjects: string[];
  pageNumber: number;
}

export interface StudyPlan {
  title: string | null;
  exam: string | null;
  purpose: { text: string; pageNumber: number } | null;
  duration: number | null;
  days: StudyDay[];
  routine: { items: string[]; pageNumber: number } | null;
  priorities: StudyPriority[];
}

function splitInline(line: string): string[] {
  return line
    .split(/\s*[•|]\s*|\s*,\s*|\s+and\s+/)
    .map((part) => part.replace(/^and\s+/i, "").trim())
    .filter((part) => part.length > 0);
}

/**
 * Reads a day-by-day study roadmap ("Day N / Hard Topic / Easy Topic / Priority N").
 * Handles both one-item-per-line bullets and inline "Hard Topic • A • B" rows.
 */
export function parseStudyPlan(pages: readonly PageText[], title: string | null): StudyPlan {
  const days: StudyDay[] = [];
  const priorities: StudyPriority[] = [];
  let routine: StudyPlan["routine"] = null;
  let purpose: StudyPlan["purpose"] = null;
  let day: StudyDay | null = null;
  let track: StudyTrack | null = null;
  let priority: StudyPriority | null = null;
  let inRoutine = false;

  const push = (item: string) => {
    const label = cleanLabel(item);
    if (!label) return;
    if (track) {
      if (!track.subject) track.subject = label;
      else track.topics.push(label);
    } else if (priority) {
      priority.subjects.push(label);
    } else if (inRoutine && routine) {
      routine.items.push(label);
    }
  };

  for (const page of pages) {
    for (const raw of page.text.split(/\n+/)) {
      const line = raw.trim();
      if (!line) continue;
      const dayMatch = line.match(/^day\s+(\d{1,3})\b\s*[:\-–]?\s*(.*)$/i);
      if (dayMatch) {
        day = { day: Number(dayMatch[1]), pageNumber: page.pageNumber, hard: null, easy: null };
        days.push(day);
        track = null;
        priority = null;
        inRoutine = false;
        continue;
      }
      const trackMatch = line.match(/^(hard|easy)\s+topics?\b\s*[:\-–]?\s*(.*)$/i);
      if (trackMatch && day) {
        track = { subject: "", topics: [], pageNumber: page.pageNumber };
        if ((trackMatch[1] ?? "").toLowerCase() === "hard") day.hard = track;
        else day.easy = track;
        priority = null;
        for (const item of splitInline(trackMatch[2] ?? "")) push(item);
        continue;
      }
      const priorityMatch = line.match(/^priority\s*(\d)\b\s*[:\-–]?\s*(.*)$/i);
      if (priorityMatch) {
        priority = { rank: Number(priorityMatch[1]), subjects: [], pageNumber: page.pageNumber };
        priorities.push(priority);
        track = null;
        day = null;
        inRoutine = false;
        for (const item of splitInline(priorityMatch[2] ?? "")) push(item);
        continue;
      }
      if (/^(revision priorit(y|ies)|priorities)$/i.test(line)) {
        track = null;
        day = null;
        continue;
      }
      const routineMatch = line.match(/^daily\s+routine\b\s*[:\-–]?\s*(.*)$/i);
      if (routineMatch) {
        routine = { items: [], pageNumber: page.pageNumber };
        inRoutine = true;
        const rest = (routineMatch[1] ?? "").replace(/\.$/, "");
        for (const item of splitInline(rest)) routine.items.push(item.replace(/^\w/, (c) => c.toUpperCase()));
        continue;
      }
      if (/^[•*\-]\s*/.test(line)) {
        push(line.replace(/^[•*\-]\s*/, ""));
        continue;
      }
      if (!purpose && days.length === 0 && line !== title) {
        const sentence = cleanSentences(line)[0];
        if (sentence && /\b(plan|syllabus|cover|prepar|schedule|exam)/i.test(sentence)) {
          purpose = { text: sentence, pageNumber: page.pageNumber };
        }
      }
    }
  }

  const corpus = pages.map((page) => page.text).join("\n");
  const numbered = days.map((item) => item.day);
  const named = [...corpus.matchAll(/\b(\d{1,3})\s*-?\s*days?\b/gi)].map((match) => Number(match[1]));
  const candidates = [...numbered, ...named].filter((value) => value > 0 && value <= 366);
  const duration = candidates.length > 0 ? Math.max(...candidates) : null;
  const exam = title
    ? title.replace(/\s*[-–:|]?\s*(professional\s+|complete\s+)?\d+\s*-?\s*days?\b.*$/i, "").trim() || null
    : null;
  return { title, exam: exam && exam !== title ? exam : exam, purpose, duration, days, routine, priorities: priorities.filter((item) => item.subjects.length > 0) };
}

export interface ScheduleBlock {
  subject: string;
  from: number;
  to: number;
  pageNumber: number;
}

/** Groups consecutive days that share a hard-topic subject: "Days 1–4: DBMS". */
export function scheduleBlocks(plan: StudyPlan): ScheduleBlock[] {
  const blocks: ScheduleBlock[] = [];
  for (const day of plan.days) {
    const subject = day.hard?.subject;
    if (!subject) continue;
    const last = blocks[blocks.length - 1];
    if (last && last.subject.toLowerCase() === subject.toLowerCase() && day.day === last.to + 1) {
      last.to = day.day;
    } else {
      blocks.push({ subject, from: day.day, to: day.day, pageNumber: day.hard?.pageNumber ?? day.pageNumber });
    }
  }
  return blocks;
}

export function dayRange(block: { from: number; to: number }): string {
  return block.from === block.to ? `Day ${block.from}` : `Days ${block.from}–${block.to}`;
}

/** Finds the day whose topics contain a phrase from the question. */
export function findTopic(
  plan: StudyPlan,
  query: string,
): { day: StudyDay; track: StudyTrack; kind: "hard" | "easy"; topic: string } | null {
  const text = query.toLowerCase();
  let best: { day: StudyDay; track: StudyTrack; kind: "hard" | "easy"; topic: string } | null = null;
  for (const day of plan.days) {
    for (const kind of ["hard", "easy"] as const) {
      const track = day[kind];
      if (!track) continue;
      for (const topic of [track.subject, ...track.topics]) {
        const key = topic.toLowerCase().replace(/\s*\(.*\)$/, "");
        if (key.length < 3 || !new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)) continue;
        if (!best || key.length > best.topic.length) best = { day, track, kind, topic };
      }
    }
  }
  return best;
}
