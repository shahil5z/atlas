import { describe, expect, it } from "vitest";
import {
  initialResearchState,
  researchReducer,
  sessionWithoutDocument,
  type ResearchState,
} from "@/features/research/research-state";
import { atlasError } from "@/lib/errors/atlas-error";
import { createResearchSession } from "@/lib/session/create-session";

describe("research session state", () => {
  it("reset clears the question, document, and chunks", () => {
    const session = createResearchSession({
      sessionId: "session-1",
      messageId: "message-1",
      query: "What markets should I consider?",
      document: {
        id: "doc-1",
        name: "brief.pdf",
        size: 100,
        pageCount: 1,
        pages: [{ pageNumber: 1, text: "A market brief with enough extracted text for a chunk." }],
        createdAt: 5,
      },
      chunks: [
        {
          chunkId: "doc-1:p1:c0:0-10",
          documentId: "doc-1",
          pageNumber: 1,
          text: "A market",
          characterStart: 0,
          characterEnd: 8,
        },
      ],
      extraction: {
        pageCount: 1,
        extractableCharacterCount: 57,
        nonEmptyPageCount: 1,
        emptyPageCount: 0,
        quality: "text",
      },
      createdAt: 5,
    });

    const ready = researchReducer(initialResearchState, { type: "session_ready", session });
    expect(ready.status).toBe("ready");
    expect(researchReducer(ready, { type: "reset" })).toEqual(initialResearchState);
  });

  it("records only the user question when no document is attached", () => {
    const session = sessionWithoutDocument("How should I validate the opportunity?", {
      sessionId: "session-2",
      messageId: "message-2",
      createdAt: 9,
    });

    expect(session.document).toBeNull();
    expect(session.chunks).toEqual([]);
    expect(session.messages).toEqual([
      {
        id: "message-2",
        role: "user",
        content: "How should I validate the opportunity?",
        createdAt: 9,
      },
    ]);
  });

  it("keeps an invalid question on the composer instead of starting a session", () => {
    const composing: ResearchState = {
      status: "composing",
      query: "   ",
      attachment: null,
      fieldError: null,
      notice: null,
    };
    const next = researchReducer(composing, {
      type: "show_field_error",
      error: atlasError("invalid_query"),
    });

    expect(next.status).toBe("composing");
    if (next.status === "composing") {
      expect(next.fieldError?.code).toBe("invalid_query");
      expect(next.query).toBe("   ");
    }
  });
});
