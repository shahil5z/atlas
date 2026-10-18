import { MAX_STRUCTURED_OUTPUT_RETRIES } from "@/config/agents";
import { atlasError } from "@/lib/errors/atlas-error";
import { isReadableModelText } from "@/lib/llm/readable";
import type { z } from "zod";

export function extractJsonCandidate(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw atlasError("structured_output_failed");
  return raw.slice(start, end + 1);
}

export function parseStructured<T>(text: string, schema: z.ZodType<T>): T {
  const slice = extractJsonCandidate(text);
  let value: unknown;
  try {
    value = JSON.parse(slice);
  } catch {
    const repaired = slice.replace(/,\s*([}\]])/g, "$1");
    value = JSON.parse(repaired);
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw atlasError("structured_output_failed");
  return parsed.data;
}

function decodeJsonString(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value;
  }
}

export function looseAnswerText(text: string): string | null {
  const match = text.match(/"answer"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (match?.[1]) {
    const decoded = decodeJsonString(match[1]).trim();
    if (isReadableModelText(decoded)) return decoded.slice(0, 2_000);
  }

  const quoted = [...text.matchAll(/"((?:\\.|[^"\\]){20,})"/g)]
    .map((item) => decodeJsonString(item[1] ?? "").trim())
    .filter((item) => isReadableModelText(item) && !/^(goal|strategy|document|model|true|false)$/i.test(item));
  if (quoted.length > 0) return quoted.slice(0, 4).join("\n\n").slice(0, 2_000);

  const stripped = text.replace(/```(?:json)?/gi, "").trim();
  if (!stripped.startsWith("{") && !stripped.startsWith("[")) {
    return isReadableModelText(stripped) ? stripped.slice(0, 2_000) : null;
  }

  const plain = stripped
    .replace(/[{}\[\]]/g, " ")
    .replace(/"[A-Za-z_]+"\s*:/g, " ")
    .replace(/"/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const letters = plain.replace(/[^A-Za-z]/g, "");
  if (letters.length < 40 || !isReadableModelText(plain)) return null;
  return plain.slice(0, 2_000);
}

export async function completeStructured<T>(options: {
  schema: z.ZodType<T>;
  generate: (correction: string | null, attempt: number) => Promise<string>;
  maxRetries?: number;
}): Promise<{ value: T; attempts: number }> {
  const maxRetries = options.maxRetries ?? MAX_STRUCTURED_OUTPUT_RETRIES;
  let correction: string | null = null;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const text = await options.generate(correction, attempt);
    try {
      return { value: parseStructured(text, options.schema), attempts: attempt + 1 };
    } catch (error) {
      lastError = error;
      correction = "The previous output was not valid JSON for the requested schema. Return one JSON object and nothing else.";
    }
  }

  if (lastError instanceof Error && lastError.name === "ResearchCancelled") throw lastError;
  throw atlasError("structured_output_failed");
}
