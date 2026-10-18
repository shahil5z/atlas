import { describe, expect, it } from "vitest";
import { runResearch } from "@/lib/agents/orchestrator";
import type { LanguageModel } from "@/lib/agents/types";
import { ResearchCancelled } from "@/lib/llm/cancelled";
import type { RetrievalOutcome } from "@/lib/retrieval/types";
import type { DocumentChunk } from "@/types/documents";

const chunk: DocumentChunk = {
  chunkId: "p2",
  documentId: "doc",
  pageNumber: 2,
  text: "Atlas uses semantic retrieval to find relevant evidence.",
  characterStart: 0,
  characterEnd: 56,
};

function outcome(): RetrievalOutcome {
  return {
    displayQuery: "evidence",
    retrievalQuery: "evidence",
    hits: [
      {
        rank: 1,
        score: 0.8,
        semanticScore: 0.8,
        lexicalScore: 0.2,
        chunkId: "p2",
        documentId: "doc",
        pageNumber: 2,
        citation: {
          id: 1,
          label: "[1]",
          documentId: "doc",
          documentName: "Notes.pdf",
          pageNumber: 2,
          chunkId: "p2",
        },
      },
    ],
    context: { sources: [], text: "", tokenEstimate: 0, truncated: false },
    generation: { system: "", userQuery: "evidence", retrievedDocumentContent: "" },
  };
}

function model(replies: string[]): LanguageModel & { calls: number } {
  const script = [...replies];
  const state = { calls: 0 };
  return {
    get calls() {
      return state.calls;
    },
    async generate(input) {
      if (input.signal.aborted) throw new ResearchCancelled();
      state.calls += 1;
      const next = script.shift();
      if (!next) throw new Error("The scripted model ran out of replies.");
      if (next === "FAIL") throw new Error("model failed");
      return { text: next, tokenCount: 3 };
    },
  };
}

const plan = JSON.stringify({
  goal: "Explain the evidence",
  subQuestions: ["What does Atlas use?"],
  strategy: "Search the document",
  requiresDocumentRetrieval: true,
  maxIterations: 2,
});

const findings = JSON.stringify({
  findings: [{ statement: "Atlas uses semantic retrieval.", chunkIds: ["p2"], source: "document" }],
  unresolvedQuestions: [],
});

const analysis = JSON.stringify({
  claims: [
    {
      text: "Atlas uses semantic retrieval.",
      support: "evidence",
      chunkIds: ["p2"],
      confidence: "high",
    },
  ],
  contradictions: [],
  missingInformation: [],
});

const insufficient = JSON.stringify({
  issues: ["Thin evidence"],
  missingEvidence: ["database"],
  unsupportedClaims: ["A second claim"],
  recommendation: "Search once more",
  shouldContinue: true,
});

const sufficient = JSON.stringify({
  issues: [],
  missingEvidence: [],
  unsupportedClaims: [],
  recommendation: "Enough evidence",
  shouldContinue: false,
});

const synthesis = JSON.stringify({
  answer: "Atlas uses semantic retrieval [1].",
  keyFindings: ["Semantic retrieval"],
  recommendations: [],
  caveats: [],
  citations: [{ chunkId: "p2" }, { chunkId: "invented" }],
  knowledgeSource: "document",
});

const document = { id: "doc", name: "Notes.pdf", pageCount: 3, size: 20 };

describe("research orchestrator", () => {
  it("retrieves again when the critic asks, then synthesizes", async () => {
    const searches: string[] = [];
    const run = await runResearch({
      runId: "run-1",
      query: "What does Atlas use?",
      document,
      chunks: [chunk],
      model: model([plan, findings, analysis, insufficient, findings, analysis, sufficient, synthesis]),
      retrieve: async (query) => {
        searches.push(query);
        return outcome();
      },
      signal: new AbortController().signal,
    });

    expect(run.status).toBe("completed");
    expect(run.metrics.iterations).toBe(2);
    expect(searches).toEqual(["What does Atlas use?", "database"]);
    expect(run.answer?.citations.map((item) => item.chunkId)).toEqual(["p2"]);
    expect(run.answer?.answer).toContain("[1]");
    expect(run.answer?.caveats.some((item) => item.includes("removed"))).toBe(true);
    expect(run.events.map((event) => event.type)).toContain("additional_research_requested");
    expect(run.events.some((event) => /chain of thought/i.test(event.message))).toBe(false);
  });

  it("stops when the critic is satisfied on the first pass", async () => {
    const onePass = JSON.stringify({ ...JSON.parse(plan), maxIterations: 1 });
    const run = await runResearch({
      runId: "run-2",
      query: "What does Atlas use?",
      document,
      chunks: [chunk],
      model: model([onePass, findings, analysis, sufficient, synthesis]),
      retrieve: async () => outcome(),
      signal: new AbortController().signal,
    });
    expect(run.answer?.termination).toBe("sufficient");
    expect(run.metrics.iterations).toBe(1);
  });

  it("synthesizes when the iteration limit is reached", async () => {
    const limited = JSON.stringify({ ...JSON.parse(plan), maxIterations: 1 });
    const run = await runResearch({
      runId: "run-3",
      query: "What does Atlas use?",
      document,
      chunks: [chunk],
      model: model([limited, findings, analysis, insufficient, synthesis]),
      retrieve: async () => outcome(),
      signal: new AbortController().signal,
    });
    expect(run.answer?.termination).toBe("iteration_limit");
    expect(run.metrics.iterations).toBe(1);
  });

  it("cancels before synthesis when the signal aborts", async () => {
    const controller = new AbortController();
    const scripted = model([plan, findings, analysis, sufficient, synthesis]);
    const original = scripted.generate.bind(scripted);
    scripted.generate = async (input) => {
      const result = await original(input);
      if (scripted.calls >= 2) controller.abort();
      return result;
    };
    await expect(
      runResearch({
        runId: "run-4",
        query: "What does Atlas use?",
        document,
        chunks: [chunk],
        model: scripted,
        retrieve: async () => outcome(),
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(ResearchCancelled);
  });

  it("fails when the model fails", async () => {
    await expect(
      runResearch({
        runId: "run-5",
        query: "What does Atlas use?",
        document,
        chunks: [chunk],
        model: model(["FAIL"]),
        retrieve: async () => outcome(),
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/model failed/);
  });

  it("enforces the researcher tool-call limit", async () => {
    const tool = JSON.stringify({ tool: "retrieveEvidence", arguments: { query: "database" } });
    let retrievals = 0;
    const run = await runResearch({
      runId: "run-6",
      query: "What does Atlas use?",
      document,
      chunks: [chunk],
      model: model([
        JSON.stringify({ ...JSON.parse(plan), maxIterations: 1 }),
        tool,
        tool,
        tool,
        findings,
        analysis,
        sufficient,
        synthesis,
      ]),
      retrieve: async () => {
        retrievals += 1;
        return outcome();
      },
      signal: new AbortController().signal,
    });
    expect(run.status).toBe("completed");
    expect(retrievals).toBeLessThanOrEqual(3);
  });

  it("labels an answer without a document as model knowledge", async () => {
    const noDocPlan = JSON.stringify({
      goal: "Reason locally",
      subQuestions: ["What matters?"],
      strategy: "Use model knowledge",
      requiresDocumentRetrieval: false,
      maxIterations: 1,
    });
    const modelFindings = JSON.stringify({
      findings: [{ statement: "A small local model is uncertain.", chunkIds: [], source: "model" }],
      unresolvedQuestions: [],
    });
    const modelAnalysis = JSON.stringify({
      claims: [
        {
          text: "A small local model is uncertain.",
          support: "model_knowledge",
          chunkIds: [],
          confidence: "low",
        },
      ],
      contradictions: [],
      missingInformation: [],
    });
    const modelSynthesis = JSON.stringify({
      answer: "This is not a live market survey.",
      keyFindings: ["Uncertain"],
      recommendations: [],
      caveats: [],
      citations: [{ chunkId: "fake" }],
      knowledgeSource: "document",
    });
    const run = await runResearch({
      runId: "run-7",
      query: "What market should a startup consider?",
      document: null,
      chunks: [],
      model: model([noDocPlan, modelFindings, modelAnalysis, sufficient, modelSynthesis]),
      retrieve: async () => outcome(),
      signal: new AbortController().signal,
    });
    expect(run.answer?.knowledgeSource).toBe("model");
    expect(run.answer?.citations).toEqual([]);
    expect(run.answer?.termination).toBe("no_document");
  });

  it("continues with one research step when the planner never returns JSON", async () => {
    const run = await runResearch({
      runId: "run-8",
      query: "What does Atlas use?",
      document,
      chunks: [chunk],
      model: model(["no json", "still no", "nope", findings, analysis, sufficient, synthesis]),
      retrieve: async () => outcome(),
      signal: new AbortController().signal,
    });
    expect(run.status).toBe("completed");
    expect(run.plan?.maxIterations).toBe(1);
    expect(run.events.some((event) => event.message.includes("one research step"))).toBe(true);
    expect(run.answer?.answer).toContain("semantic retrieval");
  });

  it("quotes retrieved passages when the model answer has no citation", async () => {
    const prose = "Atlas uses semantic retrieval on the device. This sentence is long enough to keep.";
    const run = await runResearch({
      runId: "run-9",
      query: "What does Atlas use?",
      document,
      chunks: [chunk],
      model: model([
        JSON.stringify({ ...JSON.parse(plan), maxIterations: 1 }),
        findings,
        analysis,
        sufficient,
        prose,
        prose,
        prose,
      ]),
      retrieve: async () => outcome(),
      signal: new AbortController().signal,
    });
    expect(run.answer?.answer).toContain("Atlas uses semantic retrieval to find relevant evidence.");
    expect(run.answer?.citations.map((item) => item.chunkId)).toEqual(["p2"]);
    expect(run.answer?.caveats.some((item) => item.includes("PDF"))).toBe(true);
  });

  it("uses analyzed claims when the synthesizer returns unreadable JSON", async () => {
    const broken = '{"answer":';
    const run = await runResearch({
      runId: "run-10",
      query: "What does Atlas use?",
      document,
      chunks: [chunk],
      model: model([
        JSON.stringify({ ...JSON.parse(plan), maxIterations: 1 }),
        findings,
        analysis,
        sufficient,
        broken,
        broken,
        broken,
      ]),
      retrieve: async () => outcome(),
      signal: new AbortController().signal,
    });
    expect(run.answer?.answer).toContain("semantic retrieval");
    expect(run.answer?.citations.map((item) => item.chunkId)).toEqual(["p2"]);
  });

  it("asks for plain sentences when the draft is only a tag and a URL", async () => {
    const urlDraft = JSON.stringify({
      answer: "<document_evidence> https://www.google.com/books/read/The-Great-Cathedral-of-Bleak-Hill-1904-1905",
      keyFindings: [],
      recommendations: [],
      caveats: [],
      citations: [],
      knowledgeSource: "model",
    });
    const run = await runResearch({
      runId: "run-11",
      query: "What does Atlas use?",
      document: null,
      chunks: [],
      model: model([
        JSON.stringify({ ...JSON.parse(plan), requiresDocumentRetrieval: false, maxIterations: 1 }),
        findings,
        JSON.stringify({ claims: [], contradictions: [], missingInformation: [] }),
        sufficient,
        urlDraft,
        "A browser-native agent keeps the question on the device for this session.",
      ]),
      retrieve: async () => outcome(),
      signal: new AbortController().signal,
    });
    expect(run.answer?.answer).toContain("keeps the question");
    expect(run.answer?.answer).not.toContain("http");
    expect(run.answer?.knowledgeSource).toBe("model");
  });
});
