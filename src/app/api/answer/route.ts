import { connection } from "next/server";
import { cleanHostedDraft } from "@/lib/openai/shape";

export const maxDuration = 30;

const MAX_QUERY = 2_000;
const MAX_PAGES = 40;
const MAX_PAGE_CHARS = 4_000;
const MAX_TOTAL_CHARS = 48_000;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["overview", "sections"],
  properties: {
    overview: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "bullets", "page"],
        properties: {
          heading: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
          page: { type: "integer" },
        },
      },
    },
  },
} as const;

const SYSTEM = [
  "You write the research answer for Atlas.",
  "Answer the question directly in the first sentence.",
  "Then use two to four sections. Each section has a short heading and one to three complete sentences as bullets.",
  "Rewrite the source into clear English. Do not paste long quotations.",
  "Do not use markdown, asterisks, or hash headings.",
  "When a document is provided, use only facts from that document and set page to the page number the point comes from.",
  "When no document is provided, answer from general knowledge and set page to 0.",
  "Leave out text that does not answer the question.",
].join(" ");

export async function POST(request: Request) {
  await connection();
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return Response.json({ ok: false });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false });
  }
  const packed = pack(body);
  if (!packed) return Response.json({ ok: false });

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: packed },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "atlas_answer", strict: true, schema: SCHEMA },
        },
      }),
      signal: AbortSignal.timeout(28_000),
    });
    if (!response.ok) return Response.json({ ok: false });
    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return Response.json({ ok: false });
    const draft = cleanHostedDraft(JSON.parse(content) as unknown);
    if (!draft) return Response.json({ ok: false });
    return Response.json({ ok: true, draft });
  } catch {
    return Response.json({ ok: false });
  }
}

function pack(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as { query?: unknown; documentName?: unknown; pages?: unknown };
  if (typeof record.query !== "string") return null;
  const query = record.query.trim().slice(0, MAX_QUERY);
  if (query.length < 2) return null;
  const pages = Array.isArray(record.pages) ? record.pages : [];
  const lines: string[] = [`Question: ${query}`];
  if (typeof record.documentName === "string" && record.documentName.trim()) {
    lines.push(`Document: ${record.documentName.trim().slice(0, 180)}`);
  }
  let total = 0;
  let count = 0;
  for (const page of pages) {
    if (!page || typeof page !== "object") continue;
    const item = page as { pageNumber?: unknown; text?: unknown };
    if (typeof item.pageNumber !== "number" || typeof item.text !== "string") continue;
    const text = item.text.replace(/\s+/g, " ").trim().slice(0, MAX_PAGE_CHARS);
    if (!text) continue;
    if (total + text.length > MAX_TOTAL_CHARS || count >= MAX_PAGES) break;
    total += text.length;
    count += 1;
    lines.push(`Page ${Math.round(item.pageNumber)}: ${text}`);
  }
  return lines.join("\n\n");
}
