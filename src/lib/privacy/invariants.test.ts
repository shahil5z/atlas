import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_PDF_SIZE_BYTES } from "@/config/documents";

const root = path.resolve(process.cwd(), "src");

const forbidden = [
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "document.cookie",
  "googletagmanager",
  "google-analytics",
  "posthog",
  "mixpanel",
  "sentry.io",
  "api.openai.com",
  "api.anthropic.com",
];

function files(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) return files(full);
    return full.endsWith(".ts") || full.endsWith(".tsx") ? [full] : [];
  });
}

describe("privacy invariants", () => {
  it("does not persist research data or call a paid model API from application source", () => {
    const hits: string[] = [];
    for (const file of files(root)) {
      if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
      const text = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
        .join("\n");
      for (const token of forbidden) {
        if (text.includes(token)) hits.push(`${path.relative(root, file)}:${token}`);
      }
    }
    expect(hits).toEqual([]);
    expect(files(path.join(root, "app")).some((file) => file.includes(`${path.sep}api${path.sep}`))).toBe(false);
  });

  it("treats 10 MB as 10 * 1024 * 1024 bytes", () => {
    expect(MAX_PDF_SIZE_BYTES).toBe(10 * 1024 * 1024);
  });
});
