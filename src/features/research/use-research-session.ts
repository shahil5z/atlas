"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { languageModelFromEngine } from "@/lib/llm/adapter";
import { disposeLlmEngine, initializeLlmEngine } from "@/lib/llm/llm-client";
import { isResearchCancelled } from "@/lib/llm/cancelled";
import { runResearch } from "@/lib/agents/orchestrator";
import type { AgentEvent, LanguageModel } from "@/lib/agents/types";
import { prepareDocument } from "@/lib/documents/prepare-document";
import { validatePdfFile } from "@/lib/documents/validate-pdf-file";
import {
  disposeEmbeddingEngine,
  initializeEmbeddingEngine,
} from "@/lib/embeddings/embedding-client";
import { buildVectorRecords } from "@/lib/retrieval/retrieve";
import { retrieveEvidence } from "@/lib/retrieval/retrieve";
import { clearResearchIndex, getResearchIndex } from "@/lib/embeddings/vector-index";
import { emptyMetrics } from "@/lib/retrieval/metrics";
import { createResearchSession } from "@/lib/session/create-session";
import { atlasError } from "@/lib/errors/atlas-error";
import { toAtlasError } from "@/lib/errors/to-atlas-error";
import {
  initialResearchState,
  queryError,
  researchReducer,
  type ResearchStage,
  type ResearchState,
} from "@/features/research/research-state";
import type { ExtractionAssessment, ParsedDocument } from "@/types/documents";
import type { DocumentChunk } from "@/types/documents";
import type { PreparationDetail } from "@/types/processing";
import type { EmbeddingDescriptor } from "@/types/session";
import type { PipelineMetrics } from "@/lib/retrieval/metrics";

function createIdentity() {
  return {
    sessionId: crypto.randomUUID(),
    messageId: crypto.randomUUID(),
    createdAt: Date.now(),
  };
}

interface PreparedDocument {
  file: File;
  document: ParsedDocument;
  chunks: DocumentChunk[];
  extraction: ExtractionAssessment;
  metrics: PipelineMetrics;
  embedding: EmbeddingDescriptor | null;
}

function stageFor(event: AgentEvent): ResearchStage | null {
  switch (event.type) {
    case "planning_started":
    case "planning_completed":
      return "planning";
    case "retrieval_started":
    case "retrieval_completed":
    case "additional_research_requested":
      return "retrieving";
    case "analysis_started":
    case "analysis_completed":
      return "analyzing";
    case "critique_started":
    case "critique_completed":
      return "checking";
    case "synthesis_started":
    case "synthesis_completed":
      return "synthesizing";
    default:
      return null;
  }
}

export function useResearchSession() {
  const [state, dispatch] = useReducer(researchReducer, initialResearchState);
  const stateRef = useRef<ResearchState>(state);
  const runRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const preparedRef = useRef<PreparedDocument | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const release = () => {
      abortRef.current?.abort();
      void disposeEmbeddingEngine();
      void disposeLlmEngine();
    };
    window.addEventListener("pagehide", release);
    return () => {
      runRef.current += 1;
      window.removeEventListener("pagehide", release);
      release();
    };
  }, []);

  const setQuery = useCallback((query: string) => {
    dispatch({ type: "set_query", query });
  }, []);

  const attachFile = useCallback(async (file: File) => {
    const validation = await validatePdfFile(file);
    if (!validation.ok) {
      dispatch({ type: "attachment_rejected", error: validation.error });
      return;
    }
    if (preparedRef.current?.file !== file) {
      preparedRef.current = null;
      clearResearchIndex();
    }
    dispatch({ type: "attach", attachment: { name: file.name, size: file.size, file } });
  }, []);

  const clearAttachment = useCallback(() => {
    preparedRef.current = null;
    clearResearchIndex();
    dispatch({ type: "clear_attachment" });
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const start = useCallback(async () => {
    const current = stateRef.current;
    if (current.status !== "composing") return;

    const error = queryError(current.query);
    if (error) {
      dispatch({ type: "show_field_error", error });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const runId = runRef.current + 1;
    runRef.current = runId;
    const attachment = current.attachment;
    const query = current.query.trim();
    const stillCurrent = () => runRef.current === runId && !controller.signal.aborted;
    const leaveIfStopped = () => {
      if (runRef.current !== runId) return true;
      if (controller.signal.aborted) {
        dispatch({ type: "stop_research" });
        return true;
      }
      return false;
    };

    let prepared: PreparedDocument | null = null;
    if (attachment && preparedRef.current?.file === attachment.file && getResearchIndex().size() > 0) {
      prepared = preparedRef.current;
    } else if (attachment) {
      dispatch({ type: "begin_preparing" });
      const setPhase = (phase: Extract<ResearchState, { status: "preparing" }>["phase"], detail?: PreparationDetail) => {
        if (leaveIfStopped()) return;
        dispatch({ type: "set_phase", phase, detail });
      };
      const result = await prepareDocument(attachment.file, {
        signal: controller.signal,
        onPhase: (phase) => setPhase(phase),
      });
      if (leaveIfStopped()) return;
      if (!result.ok) {
        dispatch({ type: "fail", error: result.error, document: result.document, extraction: result.extraction });
        return;
      }
      if (result.chunks.length === 0) {
        dispatch({
          type: "fail",
          error: atlasError("empty_document"),
          document: result.document,
          extraction: result.extraction,
        });
        return;
      }

      const metrics = emptyMetrics();
      metrics.parseMs = result.timings.parseMs;
      metrics.chunkMs = result.timings.chunkMs;
      const detail = { pageCount: result.document.pageCount, chunkCount: result.chunks.length };
      setPhase("loading_model", detail);
      try {
        let lastPercent = -1;
        const initStarted = performance.now();
        const engine = await initializeEmbeddingEngine((progress) => {
          if (leaveIfStopped()) return;
          if (progress.progress === undefined) {
            setPhase("loading_model", { modelFile: progress.file });
            return;
          }
          const rounded = Math.round(progress.progress);
          if (rounded === lastPercent) return;
          lastPercent = rounded;
          setPhase("loading_model", { modelFile: progress.file, modelProgress: rounded });
        });
        metrics.embeddingInitMs = performance.now() - initStarted;
        if (leaveIfStopped()) return;
        setPhase("embedding_document", detail);
        const embedStarted = performance.now();
        const vectors = await engine.embedBatch(
          result.chunks.map((chunk) => chunk.text),
          (completed, total) => setPhase("embedding_document", { embeddedChunks: completed, chunkCount: total }),
        );
        metrics.embeddingMs = performance.now() - embedStarted;
        if (leaveIfStopped()) return;
        setPhase("indexing", detail);
        const indexStarted = performance.now();
        const index = getResearchIndex();
        index.clear();
        index.add(buildVectorRecords(result.chunks, vectors));
        metrics.indexingMs = performance.now() - indexStarted;
        prepared = {
          file: attachment.file,
          document: result.document,
          chunks: result.chunks,
          extraction: result.extraction,
          metrics,
          embedding:
            engine.dimension && engine.device
              ? { modelId: engine.modelId, dimension: engine.dimension, device: engine.device }
              : null,
        };
        preparedRef.current = prepared;
      } catch (error) {
        if (leaveIfStopped()) return;
        clearResearchIndex();
        dispatch({
          type: "fail",
          error: toAtlasError(error, "embed"),
          document: result.document,
          chunks: result.chunks,
          extraction: result.extraction,
        });
        return;
      }
    }

    if (leaveIfStopped()) return;

    dispatch({
      type: "begin_research",
      query,
      attachment,
      document: prepared?.document ?? null,
    });

    const events: AgentEvent[] = [];
    try {
      let lastPercent = -1;
      // The local LLM loads lazily: deterministic document answers (overviews,
      // lookups) never call the model, so they do not wait for it to download.
      let modelInitMs: number | null = null;
      let llmReady: ReturnType<typeof initializeLlmEngine> | null = null;
      const loadModel = () => {
        if (!llmReady) {
          const modelStarted = performance.now();
          llmReady = initializeLlmEngine((progress) => {
            if (leaveIfStopped()) return;
            const percent = progress.progress === undefined ? null : Math.round(progress.progress);
            if (percent !== null && percent === lastPercent) return;
            if (percent !== null) lastPercent = percent;
            dispatch({ type: "research_update", stage: "loading_model", events: [...events], modelProgress: percent });
          }).then((engine) => {
            modelInitMs = performance.now() - modelStarted;
            return engine;
          });
        }
        return llmReady;
      };
      const lazyModel: LanguageModel = {
        async generate(request) {
          const llm = await loadModel();
          return languageModelFromEngine(llm).generate(request);
        },
      };
      const researchStarted = performance.now();
      if (leaveIfStopped()) return;

      const run = await runResearch({
        runId: crypto.randomUUID(),
        query,
        document: prepared
          ? {
              id: prepared.document.id,
              name: prepared.document.name,
              pageCount: prepared.document.pageCount,
              size: prepared.document.size,
            }
          : null,
        chunks: prepared?.chunks ?? [],
        model: lazyModel,
        signal: controller.signal,
        retrieve: async (search, topK) => {
          const engine = await initializeEmbeddingEngine();
          const queryVector = await engine.embed(search);
          return retrieveEvidence({
            query: search,
            documentName: prepared?.document.name ?? "Document",
            chunks: prepared?.chunks ?? [],
            index: getResearchIndex(),
            queryVector,
            options: { topK },
          });
        },
        onEvent: (event) => {
          events.push(event);
          const stage = stageFor(event);
          if (!stage || !stillCurrent()) return;
          dispatch({ type: "research_update", stage, events: [...events], modelProgress: null });
        },
      });

      if (leaveIfStopped()) return;
      const metrics = prepared?.metrics ?? emptyMetrics();
      dispatch({
        type: "session_ready",
        session: createResearchSession({
          ...createIdentity(),
          query,
          document: prepared?.document ?? null,
          chunks: prepared?.chunks ?? [],
          extraction: prepared?.extraction ?? null,
          metrics,
          embedding: prepared?.embedding ?? null,
          sourceFile: attachment?.file ?? null,
          answer: run.answer,
          trace: run.events,
          runMetrics: { ...run.metrics, modelInitMs, totalMs: performance.now() - researchStarted },
        }),
      });
    } catch (error) {
      if (runRef.current !== runId) return;
      if (isResearchCancelled(error) || controller.signal.aborted) {
        dispatch({ type: "stop_research" });
        return;
      }
      dispatch({
        type: "fail",
        error: toAtlasError(error, "llm"),
        document: prepared?.document ?? null,
        chunks: prepared?.chunks ?? [],
        extraction: prepared?.extraction ?? null,
      });
    }
  }, []);

  const edit = useCallback(() => {
    abortRef.current?.abort();
    runRef.current += 1;
    dispatch({ type: "edit" });
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    runRef.current += 1;
    const current = stateRef.current;
    const keeping =
      current.status === "ready" && current.session.sourceFile && preparedRef.current?.file === current.session.sourceFile;
    if (!keeping) {
      preparedRef.current = null;
      clearResearchIndex();
    }
    dispatch({ type: "reset" });
  }, []);

  return { state, setQuery, attachFile, clearAttachment, start, stop, edit, reset };
}
