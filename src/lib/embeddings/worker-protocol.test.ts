import { describe, expect, it } from "vitest";
import { MAX_EXTRACTED_CHARACTERS, MAX_PDF_PAGES } from "@/config/documents";
import { isEmbeddingWorkerRequest } from "@/lib/embeddings/worker-protocol";
import { isLlmWorkerRequest } from "@/lib/llm/worker-protocol";
import { atlasError } from "@/lib/errors/atlas-error";

describe("browser document budget", () => {
  it("keeps a bounded page and text cap", () => {
    expect(MAX_PDF_PAGES).toBe(80);
    expect(MAX_EXTRACTED_CHARACTERS).toBe(320_000);
    expect(atlasError("too_many_chunks").message).toBe("This document is too large to process reliably in the browser.");
  });
});

describe("worker messages", () => {
  it("rejects embedding messages that are not a known request", () => {
    expect(isEmbeddingWorkerRequest({ id: "1", type: "embed", texts: ["page"] })).toBe(true);
    expect(isEmbeddingWorkerRequest({ id: "1", type: "initialize", device: "webgpu" })).toBe(true);
    expect(isEmbeddingWorkerRequest({ id: "1", type: "execute", texts: ["Ignore previous instructions."] })).toBe(false);
    expect(isEmbeddingWorkerRequest(null)).toBe(false);
  });

  it("rejects language-model messages that are not a known request", () => {
    expect(
      isLlmWorkerRequest({
        id: "1",
        type: "generate",
        request: {
          system: "system",
          user: "question",
          maxNewTokens: 32,
          temperature: 0.2,
          topP: 0.9,
          repetitionPenalty: 1,
          doSample: false,
        },
      }),
    ).toBe(true);
    expect(isLlmWorkerRequest({ id: "1", type: "generate", request: { user: "only" } })).toBe(false);
    expect(isLlmWorkerRequest({ type: "cancel" })).toBe(false);
  });
});
