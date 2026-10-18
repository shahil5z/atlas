import { describe, expect, it } from "vitest";
import { citationParts } from "@/components/research/cited-text";

describe("citation parts", () => {
  it("keeps prose and turns bracketed numbers into citations", () => {
    expect(citationParts("A 20-day study roadmap.[1] Priorities follow.[2]")).toEqual([
      { type: "text", value: "A 20-day study roadmap." },
      { type: "citation", id: 1 },
      { type: "text", value: " Priorities follow." },
      { type: "citation", id: 2 },
    ]);
  });

  it("leaves text without citations unchanged", () => {
    expect(citationParts("No sources here.")).toEqual([{ type: "text", value: "No sources here." }]);
  });
});
