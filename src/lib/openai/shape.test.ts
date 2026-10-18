import { describe, expect, it } from "vitest";
import { cleanHostedDraft, hostedToAnswer } from "@/lib/openai/shape";
import type { DocumentChunk } from "@/types/documents";

const chunk: DocumentChunk = {
  chunkId: "p1",
  documentId: "doc",
  pageNumber: 1,
  text: "Records are kept for 7 years.",
  characterStart: 0,
  characterEnd: 30,
};

describe("hosted answer shape", () => {
  it("drops markdown marks and keeps a heading with bullets", () => {
    const draft = cleanHostedDraft({
      overview: "**This PDF is about retention.**",
      sections: [{ heading: "Retention", bullets: ["Records stay on file for **7 years**."], page: 1 }],
    });
    expect(draft?.overview).toBe("This PDF is about retention.");
    expect(draft?.sections[0]?.bullets[0]).toBe("Records stay on file for 7 years.");
    expect(JSON.stringify(draft)).not.toContain("**");
  });

  it("maps a page number onto the chunk from that page", () => {
    const draft = cleanHostedDraft({
      overview: "Records stay on file for 7 years.",
      sections: [{ heading: "Retention", bullets: ["Records stay on file for 7 years."], page: 1 }],
    });
    const answer = hostedToAnswer(draft!, { id: "doc", name: "policy.pdf" }, [chunk]);
    expect(answer.provider).toBe("openai");
    expect(answer.citations[0]?.pageNumber).toBe(1);
    expect(answer.structured?.sections).toHaveLength(1);
    expect(answer.answer).not.toContain("**");
  });

  it("rejects an empty overview", () => {
    expect(cleanHostedDraft({ overview: "  ", sections: [] })).toBeNull();
  });
});
