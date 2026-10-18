import {
  FINAL_DO_SAMPLE,
  MAX_ITERATIONS,
  MAX_RESEARCH_STEPS,
  MAX_TOOL_CALLS_PER_AGENT,
  STRUCTURED_DO_SAMPLE,
} from "@/config/agents";
import { LOCAL_LLM_CONFIG } from "@/config/llm";
import { DEFAULT_TOP_K } from "@/config/retrieval";
import { atlasError, isAtlasError } from "@/lib/errors/atlas-error";
import { ANALYST_PROMPT_V1 } from "@/lib/agents/prompts/analyst";
import { CRITIC_PROMPT_V1 } from "@/lib/agents/prompts/critic";
import { PLANNER_PROMPT_V1 } from "@/lib/agents/prompts/planner";
import { RESEARCHER_PROMPT_V1 } from "@/lib/agents/prompts/researcher";
import { SYNTHESIZER_PLAIN_V1, SYNTHESIZER_PROMPT_V1 } from "@/lib/agents/prompts/synthesizer";
import { validateAnswerCitations, type EvidenceRef } from "@/lib/agents/citations";
import { buildAgentPrompt } from "@/lib/agents/context";
import {
  analysisSchema,
  criticSchema,
  plannerSchema,
  researchSchema,
  synthesisSchema,
  toolRequestSchema,
  type AnalysisOutput,
  type CriticOutput,
  type PlannerOutput,
  type ResearchOutput,
} from "@/lib/agents/schemas";
import { contentWords } from "@/lib/answer/answer-plan";
import { completeStructured, extractJsonCandidate, looseAnswerText } from "@/lib/agents/structured";
import { cleanSentences, isPromptLike } from "@/lib/documents/clean-text";
import { rewriteExcerpt } from "@/lib/documents/rewrite";
import { executeTool, type ToolContext } from "@/lib/agents/tools";
import type {
  AgentEvent,
  AgentRole,
  AgentRun,
  LanguageModel,
  ResearchAnswer,
  ResearchRunMetrics,
  TerminationReason,
} from "@/lib/agents/types";
import { ResearchCancelled } from "@/lib/llm/cancelled";
import { buildTrace } from "@/lib/observability/trace";
import { composeDocumentAnswer } from "@/lib/documents/compose-answer";
import { gateModelAnswer, honestFailure } from "@/lib/answer/finalize";
import { isReadableModelText, presentableAnswer } from "@/lib/llm/readable";
import type { RetrievalHit, RetrievalOutcome } from "@/lib/retrieval/types";
import type { DocumentChunk } from "@/types/documents";

export interface ResearchOrchestratorInput {
  runId: string;
  query: string;
  document: ToolContext["document"];
  chunks: readonly DocumentChunk[];
  model: LanguageModel;
  retrieve: (query: string, topK: number) => Promise<RetrievalOutcome>;
  signal: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
}

function emptyMetrics(): ResearchRunMetrics {
  return {
    totalMs: null,
    modelInitMs: null,
    planningMs: null,
    retrievalMs: null,
    analysisMs: null,
    critiqueMs: null,
    synthesisMs: null,
    iterations: 0,
    toolCalls: 0,
    generatedTokens: null,
    firstTokenMs: null,
    retrievedChunks: 0,
    contextTokenEstimate: null,
  };
}

function throwIfStopped(signal: AbortSignal): void {
  if (signal.aborted) throw new ResearchCancelled();
}

export async function runResearch(input: ResearchOrchestratorInput): Promise<AgentRun> {
  const started = performance.now();
  const metrics = emptyMetrics();
  const events: AgentEvent[] = [];
  const chunksById = new Map(input.chunks.map((chunk) => [chunk.chunkId, chunk]));
  const evidence = new Map<string, RetrievalHit>();
  let tokens = 0;
  let sawTokens = false;

  const emit = (type: AgentEvent["type"], agent: AgentEvent["agent"], message: string, promptId?: string) => {
    const event: AgentEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type,
      agent,
      message,
      promptId,
    };
    events.push(event);
    input.onEvent?.(event);
  };

  const run: AgentRun = {
    runId: input.runId,
    query: input.query,
    status: "running",
    currentAgent: "orchestrator",
    iteration: 0,
    startedAt: Date.now(),
    completedAt: null,
    events,
    spans: [],
    plan: null,
    findings: null,
    analysis: null,
    critique: null,
    answer: null,
    metrics,
  };

  const addTokens = (count: number | null) => {
    if (count === null) return;
    sawTokens = true;
    tokens += count;
  };

  const generateText = async (
    role: AgentRole,
    promptId: string,
    system: string,
    task: string,
    evidenceText: string,
    correction: string | null,
    structured: boolean,
  ) => {
    throwIfStopped(input.signal);
    const built = buildAgentPrompt({
      system,
      userQuery: input.query,
      evidence: evidenceText,
      task: correction ? `${task}\n${correction}` : task,
    });
    run.currentAgent = role;
    const result = await input.model.generate({
      system: built.system,
      user: built.user,
      maxNewTokens: structured ? LOCAL_LLM_CONFIG.structuredMaxNewTokens : LOCAL_LLM_CONFIG.maxNewTokens,
      temperature: structured ? LOCAL_LLM_CONFIG.structuredTemperature : LOCAL_LLM_CONFIG.temperature,
      doSample: structured ? STRUCTURED_DO_SAMPLE : FINAL_DO_SAMPLE,
      signal: input.signal,
    });
    addTokens(result.tokenCount);
    return result.text;
  };

  try {
    emit("run_started", "orchestrator", "Research started.");
    if (input.document) {
      const composed = composeDocumentAnswer({
        query: input.query,
        document: input.document,
        chunks: input.chunks,
      });
      if (composed) {
        emit("planning_completed", "planner", "Matched the question to the document.");
        emit("retrieval_completed", "researcher", `Read ${composed.profile.textPages} text pages.`);
        run.answer = composed.answer;
        emit("synthesis_completed", "synthesizer", "Answer ready.");
        emit("run_completed", "orchestrator", "Research complete.");
        run.status = "completed";
        run.completedAt = Date.now();
        metrics.totalMs = performance.now() - started;
        metrics.retrievedChunks = composed.answer.citations.length;
        run.currentAgent = null;
        run.spans = buildTrace(events, metrics, run.status);
        return run;
      }
    }
    emit("planning_started", "planner", "Planning the research.");
    const planStarted = performance.now();
    let plan: PlannerOutput;
    try {
      const planned = await completeStructured({
        schema: plannerSchema,
        generate: (correction) =>
          generateText("planner", PLANNER_PROMPT_V1.id, PLANNER_PROMPT_V1.system, PLANNER_PROMPT_V1.task, "", correction, true),
      });
      plan = {
        ...planned.value,
        subQuestions: planned.value.subQuestions.slice(0, MAX_RESEARCH_STEPS),
        maxIterations: Math.min(planned.value.maxIterations, MAX_ITERATIONS),
      };
      emit("planning_completed", "planner", `Planned ${plan.subQuestions.length} questions.`, PLANNER_PROMPT_V1.id);
    } catch (error) {
      if (!isAtlasError(error) || error.code !== "structured_output_failed") throw error;
      plan = {
        goal: input.query.slice(0, 400),
        subQuestions: [input.query.slice(0, 240)],
        strategy: "Use one research pass.",
        requiresDocumentRetrieval: Boolean(input.document),
        maxIterations: 1,
      };
      emit("planning_completed", "planner", "Planner output was not usable, so Atlas continued with one research step.", PLANNER_PROMPT_V1.id);
    }
    metrics.planningMs = performance.now() - planStarted;
    run.plan = plan;

    const toolContext: ToolContext = {
      document: input.document,
      chunks: input.chunks,
      retrieve: input.retrieve,
    };

    let findings: ResearchOutput | null = null;
    let analysis: AnalysisOutput | null = null;
    let critique: CriticOutput | null = null;
    let termination: TerminationReason = "sufficient";

    const limit = plan.maxIterations;
    for (let iteration = 1; iteration <= limit; iteration += 1) {
      throwIfStopped(input.signal);
      run.iteration = iteration;
      metrics.iterations = iteration;

      const searches =
        iteration === 1
          ? plan.requiresDocumentRetrieval
            ? plan.subQuestions
            : []
          : (critique?.missingEvidence ?? []);

      if (input.document && searches.length > 0) {
        emit(
          iteration === 1 ? "retrieval_started" : "additional_research_requested",
          "researcher",
          iteration === 1 ? "Searching the document." : "Searching again for missing evidence.",
        );
        const retrievalStarted = performance.now();
        for (const search of searches.slice(0, MAX_RESEARCH_STEPS)) {
          throwIfStopped(input.signal);
          const outcome = await input.retrieve(search, DEFAULT_TOP_K);
          metrics.toolCalls += 1;
          for (const hit of outcome.hits) evidence.set(hit.chunkId, hit);
        }
        metrics.retrievalMs = (metrics.retrievalMs ?? 0) + (performance.now() - retrievalStarted);
        emit("retrieval_completed", "researcher", `Retrieved ${evidence.size} relevant passages.`);
      }

      const evidenceText = renderEvidence(evidence, chunksById);
      emit("retrieval_started", "researcher", "Reviewing evidence.");
      try {
        findings = await collectFindings(evidenceText, toolContext, evidence, chunksById, generateText, metrics);
      } catch (error) {
        if (!isAtlasError(error) || error.code !== "structured_output_failed") throw error;
        findings = { findings: [], unresolvedQuestions: [input.query] };
      }
      run.findings = findings;
      emit("retrieval_completed", "researcher", `Recorded ${findings.findings.length} findings.`, RESEARCHER_PROMPT_V1.id);

      emit("analysis_started", "analyst", "Analyzing the findings.");
      const analysisStarted = performance.now();
      try {
        analysis = (
          await completeStructured({
            schema: analysisSchema,
            generate: (correction) =>
              generateText(
                "analyst",
                ANALYST_PROMPT_V1.id,
                ANALYST_PROMPT_V1.system,
                ANALYST_PROMPT_V1.task,
                `${evidenceText}\nFindings: ${findings?.findings.map((item) => item.statement).join(" ")}`,
                correction,
                true,
              ),
          })
        ).value;
      } catch (error) {
        if (!isAtlasError(error) || error.code !== "structured_output_failed") throw error;
        analysis = { claims: [], contradictions: [], missingInformation: ["Analysis output was not usable."] };
      }
      metrics.analysisMs = (metrics.analysisMs ?? 0) + (performance.now() - analysisStarted);
      run.analysis = analysis;
      emit("analysis_completed", "analyst", `Identified ${analysis.claims.length} claims.`, ANALYST_PROMPT_V1.id);

      emit("critique_started", "critic", "Checking the analysis.");
      const critiqueStarted = performance.now();
      try {
        critique = (
          await completeStructured({
            schema: criticSchema,
            generate: (correction) =>
              generateText(
                "critic",
                CRITIC_PROMPT_V1.id,
                CRITIC_PROMPT_V1.system,
                CRITIC_PROMPT_V1.task,
                evidenceText,
                correction,
                true,
              ),
          })
        ).value;
      } catch (error) {
        if (!isAtlasError(error) || error.code !== "structured_output_failed") throw error;
        critique = {
          issues: ["The critic did not return a usable check."],
          missingEvidence: [],
          unsupportedClaims: [],
          recommendation: "Synthesize with what is available.",
          shouldContinue: false,
        };
      }
      metrics.critiqueMs = (metrics.critiqueMs ?? 0) + (performance.now() - critiqueStarted);
      run.critique = critique;
      emit(
        "critique_completed",
        "critic",
        critique.unsupportedClaims.length > 0
          ? `Critic identified ${critique.unsupportedClaims.length} unsupported claims.`
          : "Critic found no unsupported claims.",
        CRITIC_PROMPT_V1.id,
      );

      if (!input.document) {
        termination = "no_document";
        break;
      }
      if (!critique.shouldContinue || critique.missingEvidence.length === 0) {
        termination = "sufficient";
        break;
      }
      if (iteration >= limit) {
        termination = "iteration_limit";
        break;
      }
    }

    emit("synthesis_started", "synthesizer", "Writing the answer.");
    const synthesisStarted = performance.now();
    let rawSynthesis = "";
    let synthesis;
    try {
      synthesis = (
        await completeStructured({
          schema: synthesisSchema,
          generate: async (correction) => {
            rawSynthesis = await generateText(
              "synthesizer",
              SYNTHESIZER_PROMPT_V1.id,
              SYNTHESIZER_PROMPT_V1.system,
              SYNTHESIZER_PROMPT_V1.task,
              renderEvidence(evidence, chunksById),
              correction,
              false,
            );
            return rawSynthesis;
          },
        })
      ).value;
    } catch (error) {
      if (!isAtlasError(error) || error.code !== "structured_output_failed") throw error;
      const analysisText = analysis?.claims.map((claim) => claim.text).join("\n\n");
      const findingText = findings?.findings.map((finding) => finding.statement).join("\n\n");
      const fromAnalysis = [analysisText, findingText].find((value) => value && isReadableModelText(value));
      const loose = looseAnswerText(rawSynthesis) ?? fromAnalysis ?? "";
      if (!isReadableModelText(loose)) {
        if (!input.document) throw error;
        synthesis = {
          answer: "",
          keyFindings: [],
          recommendations: [],
          caveats: [],
          citations: [],
          knowledgeSource: "document",
        };
      } else {
      const grounded =
        loose.trim() === analysisText?.trim()
          ? analysis?.claims.flatMap((claim) => claim.chunkIds) ?? []
          : loose.trim() === findingText?.trim()
            ? findings?.findings.flatMap((finding) => finding.chunkIds) ?? []
            : [];
      synthesis = {
        answer: loose.trim(),
        keyFindings: [],
        recommendations: [],
        caveats: ["The local model did not return a fully structured answer."],
        citations: grounded.map((chunkId) => ({ chunkId })),
        knowledgeSource: input.document ? "document" as const : "model" as const,
      };
      }
    }
    let presented = presentableAnswer(synthesis.answer);
    if (!presented && !input.document) {
      const plainResult = await input.model.generate({
        system: SYNTHESIZER_PLAIN_V1.system,
        user: `${SYNTHESIZER_PLAIN_V1.task}\n${input.query}`,
        maxNewTokens: 160,
        temperature: LOCAL_LLM_CONFIG.temperature,
        doSample: FINAL_DO_SAMPLE,
        signal: input.signal,
      });
      addTokens(plainResult.tokenCount);
      const plain = presentableAnswer(plainResult.text);
      if (!plain) throw atlasError("structured_output_failed");
      presented = plain;
      synthesis = {
        answer: plain,
        keyFindings: [],
        recommendations: [],
        caveats: ["The local model did not return a fully structured answer."],
        citations: [],
        knowledgeSource: input.document ? "document" : "model",
      };
    } else if (presented && presented !== synthesis.answer) {
      synthesis = { ...synthesis, answer: presented };
    }
    metrics.synthesisMs = performance.now() - synthesisStarted;

    const validated = presented
      ? validateAnswerCitations(synthesis.answer, synthesis.citations, evidenceRefs(evidence, chunksById))
      : { answer: "", citations: [], removedCount: 0 };
    const passages =
      input.document && validated.citations.length === 0
        ? passagesFromDocument(input.query, input.document, evidence, chunksById, input.chunks, termination)
        : null;
    if (input.document && validated.citations.length === 0 && !passages) {
      throw atlasError("structured_output_failed");
    }
    const knowledgeSource = input.document && (validated.citations.length > 0 || passages) ? "document" : "model";
    const caveats = passages ? passages.caveats : [...synthesis.caveats];
    if (!passages && validated.removedCount > 0) caveats.push("References that did not match retrieved pages were removed.");
    if (!input.document) caveats.push("This answer uses the model's internal knowledge, not a live web search.");

    const answer: ResearchAnswer = passages ?? {
      answer: validated.answer,
      keyFindings: synthesis.keyFindings,
      recommendations: synthesis.recommendations,
      caveats,
      citations: knowledgeSource === "document" ? validated.citations : [],
      knowledgeSource,
      termination,
    };
    // Quality gate: pass, one bounded repair, deterministic answer, then an honest failure.
    const gated = gateModelAnswer(answer, input.query, Boolean(input.document));
    const fallback =
      !gated && input.document
        ? composeDocumentAnswer({ query: input.query, document: input.document, chunks: input.chunks })?.answer ?? null
        : null;
    run.answer = gated ?? fallback ?? honestFailure(answer);
    emit("synthesis_completed", "synthesizer", "Answer ready.", SYNTHESIZER_PROMPT_V1.id);
    emit("run_completed", "orchestrator", "Research complete.");
    run.status = "completed";
    run.completedAt = Date.now();
    metrics.totalMs = performance.now() - started;
    metrics.generatedTokens = sawTokens ? tokens : null;
    metrics.retrievedChunks = evidence.size;
    run.currentAgent = null;
    run.spans = buildTrace(events, metrics, run.status);
    return run;
  } catch (error) {
    metrics.totalMs = performance.now() - started;
    metrics.generatedTokens = sawTokens ? tokens : null;
    metrics.retrievedChunks = evidence.size;
    if (error instanceof ResearchCancelled || input.signal.aborted) {
      emit("run_cancelled", "orchestrator", "Research stopped.");
      run.status = "cancelled";
      run.completedAt = Date.now();
      run.spans = buildTrace(events, metrics, run.status);
      throw new ResearchCancelled();
    }
    emit("run_failed", "orchestrator", "Research failed.");
    run.status = "failed";
    run.completedAt = Date.now();
    run.spans = buildTrace(events, metrics, run.status);
    throw error;
  }
}

async function collectFindings(
  evidenceText: string,
  context: ToolContext,
  evidence: Map<string, RetrievalHit>,
  chunksById: Map<string, DocumentChunk>,
  generateText: (
    role: AgentRole,
    promptId: string,
    system: string,
    task: string,
    evidenceText: string,
    correction: string | null,
    structured: boolean,
  ) => Promise<string>,
  metrics: ResearchRunMetrics,
): Promise<ResearchOutput> {
  let notes = evidenceText;
  let toolCalls = 0;
  let correction: string | null = null;

  for (let attempt = 0; attempt <= MAX_TOOL_CALLS_PER_AGENT; attempt += 1) {
    const text = await generateText(
      "researcher",
      RESEARCHER_PROMPT_V1.id,
      RESEARCHER_PROMPT_V1.system,
      RESEARCHER_PROMPT_V1.task,
      notes,
      correction,
      true,
    );
    if (toolCalls < MAX_TOOL_CALLS_PER_AGENT && looksLikeTool(text)) {
      try {
        const request = toolRequestSchema.parse(JSON.parse(extractJsonCandidate(text)));
        const executed = await executeTool(request.tool, request.arguments, context);
        toolCalls += 1;
        metrics.toolCalls += 1;
        if (executed.retrieval) {
          for (const hit of executed.retrieval.hits) evidence.set(hit.chunkId, hit);
        }
        notes = `${renderEvidence(evidence, chunksById)}\n${executed.summary}`;
        correction = null;
        continue;
      } catch {
        correction = "The tool request was invalid. Return the findings JSON instead.";
        continue;
      }
    }
    try {
      return researchSchema.parse(JSON.parse(extractJsonCandidate(text).replace(/,\s*([}\]])/g, "$1")));
    } catch {
      correction = "Return the findings JSON only. Do not request a tool.";
    }
  }

  const finished = await completeStructured({
    schema: researchSchema,
    generate: (next) =>
      generateText(
        "researcher",
        RESEARCHER_PROMPT_V1.id,
        RESEARCHER_PROMPT_V1.system,
        RESEARCHER_PROMPT_V1.task,
        notes,
        next ?? "Return the findings JSON only.",
        true,
      ),
  });
  return finished.value;
}

function looksLikeTool(text: string): boolean {
  try {
    const value = JSON.parse(extractJsonCandidate(text)) as { tool?: unknown };
    return typeof value.tool === "string";
  } catch {
    return false;
  }
}

function passagesFromDocument(
  query: string,
  document: NonNullable<ResearchOrchestratorInput["document"]>,
  evidence: Map<string, RetrievalHit>,
  chunksById: Map<string, DocumentChunk>,
  chunks: readonly DocumentChunk[],
  termination: TerminationReason,
): ResearchAnswer | null {
  const ranked = [...evidence.values()].sort((left, right) => left.rank - right.rank).slice(0, 5);
  const picked =
    ranked.length > 0
      ? ranked.map((hit) => ({
          citation: hit.citation,
          text: (chunksById.get(hit.chunkId)?.text ?? "").trim(),
        }))
      : chunks.slice(0, 3).map((chunk, index) => {
          const id = index + 1;
          return {
            citation: {
              id,
              label: `[${id}]`,
              documentId: document.id,
              documentName: document.name,
              pageNumber: chunk.pageNumber,
              chunkId: chunk.chunkId,
            },
            text: chunk.text.trim(),
          };
        });
  const asked = new Set(contentWords(query));
  const relevant = picked.flatMap((item) => {
    const sentences = cleanSentences(item.text).filter((sentence) => !isPromptLike(sentence));
    const pool = sentences.length > 0 ? sentences : isPromptLike(item.text) ? [] : [item.text];
    const best = [...pool].sort((left, right) => questionOverlap(right, asked) - questionOverlap(left, asked))[0];
    if (!best) return [];
    if (asked.size > 0 && sentences.length > 0 && questionOverlap(best, asked) === 0) return [];
    const said = rewriteExcerpt(best) || best;
    return [{ citation: item.citation, text: said }];
  });
  const usable = relevant.length > 0 ? relevant.slice(0, 3) : picked.filter((item) => item.text.length > 0 && !isPromptLike(item.text)).slice(0, 2);
  if (usable.length === 0) return null;
  const answer = usable
    .map((item) => `${item.text} ${item.citation.label}`)
    .join("\n\n");
  return {
    answer,
    keyFindings: [],
    recommendations: [],
    caveats: ["Rewritten from the PDF."],
    citations: usable.map((item) => item.citation),
    knowledgeSource: "document",
    termination,
  };
}

function questionOverlap(text: string, asked: ReadonlySet<string>): number {
  if (asked.size === 0) return 0;
  const words = new Set(contentWords(text));
  let hits = 0;
  for (const word of asked) if (words.has(word) || [...words].some((item) => item.startsWith(word) || word.startsWith(item))) hits += 1;
  return hits;
}

function renderEvidence(evidence: Map<string, RetrievalHit>, chunksById: Map<string, DocumentChunk>): string {
  const hits = [...evidence.values()];
  if (hits.length === 0) return "";
  return hits
    .map((hit) => {
      const text = chunksById.get(hit.chunkId)?.text ?? "";
      return `${hit.citation.label} page ${hit.pageNumber} chunk ${hit.chunkId}\n${text}`;
    })
    .join("\n\n");
}

function evidenceRefs(evidence: Map<string, RetrievalHit>, chunksById: Map<string, DocumentChunk>): EvidenceRef[] {
  return [...evidence.values()].map((hit) => ({
    citation: hit.citation,
    chunkId: hit.chunkId,
    pageNumber: hit.pageNumber,
    documentId: hit.documentId,
    documentName: hit.citation.documentName,
    excerpt: chunksById.get(hit.chunkId)?.text ?? "",
  }));
}
