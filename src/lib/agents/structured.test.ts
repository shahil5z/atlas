import { describe, expect, it } from "vitest";
import { analysisSchema } from "@/lib/agents/schemas";
import { completeStructured, extractJsonCandidate, looseAnswerText, parseStructured } from "@/lib/agents/structured";
import { AtlasError } from "@/types/errors";
import { ResearchCancelled } from "@/lib/llm/cancelled";

describe("structured output", () => {
  it("extracts fenced JSON and repairs a trailing comma", () => {
    const text = "```json\n{\"claims\":[{\"text\":\"A\",\"support\":\"evidence\",\"chunkIds\":[\"c1\"],\"confidence\":\"high\"},],\"contradictions\":[],\"missingInformation\":[]}\n```";
    const value = parseStructured(text, analysisSchema);
    expect(value.claims[0]?.text).toBe("A");
    expect(extractJsonCandidate(text)).toContain("claims");
  });

  it("stops after the retry limit", async () => {
    let calls = 0;
    await expect(
      completeStructured({
        schema: analysisSchema,
        maxRetries: 2,
        generate: async () => {
          calls += 1;
          return "not json";
        },
      }),
    ).rejects.toBeInstanceOf(AtlasError);
    expect(calls).toBe(3);
  });

  it("rejects symbol soup instead of treating it as an answer", () => {
    expect(looseAnswerText(".*@'?6*%(<'><%)*%/3=(0!8A@")).toBeNull();
  });

  it("does not keep retrying after cancellation", async () => {
    await expect(
      completeStructured({
        schema: analysisSchema,
        generate: async () => {
          throw new ResearchCancelled();
        },
      }),
    ).rejects.toBeInstanceOf(ResearchCancelled);
  });
});
