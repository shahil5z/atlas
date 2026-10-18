import { MAX_QUERY_LENGTH } from "@/config/app";
import { atlasError } from "@/lib/errors/atlas-error";
import { createResearchSession } from "@/lib/session/create-session";
import type {
  ExtractionAssessment,
  DocumentChunk,
  ParsedDocument,
  SelectedDocument,
} from "@/types/documents";
import type { AgentEvent } from "@/lib/agents/types";
import type { AtlasError } from "@/types/errors";
import type { PreparationDetail, ResearchPhase } from "@/types/processing";
import type { ResearchSession } from "@/types/session";

export type ResearchStage =
  | "loading_model"
  | "planning"
  | "retrieving"
  | "analyzing"
  | "checking"
  | "synthesizing";

export type ResearchState =
  | {
      status: "composing";
      query: string;
      attachment: SelectedDocument | null;
      fieldError: AtlasError | null;
      notice: string | null;
    }
  | {
      status: "preparing";
      query: string;
      attachment: SelectedDocument;
      phase: ResearchPhase;
      detail: PreparationDetail | null;
    }
  | {
      status: "researching";
      query: string;
      attachment: SelectedDocument | null;
      document: ParsedDocument | null;
      stage: ResearchStage;
      events: AgentEvent[];
      modelProgress: number | null;
    }
  | {
      status: "ready";
      session: ResearchSession;
    }
  | {
      status: "error";
      query: string;
      attachment: SelectedDocument | null;
      error: AtlasError;
      document: ParsedDocument | null;
      chunks: DocumentChunk[];
      extraction: ExtractionAssessment | null;
    };

export type ResearchAction =
  | { type: "set_query"; query: string }
  | { type: "attach"; attachment: SelectedDocument }
  | { type: "attachment_rejected"; error: AtlasError }
  | { type: "clear_attachment" }
  | { type: "show_field_error"; error: AtlasError }
  | { type: "begin_preparing" }
  | { type: "set_phase"; phase: ResearchPhase; detail?: PreparationDetail }
  | { type: "session_ready"; session: ResearchSession }
  | { type: "begin_research"; query: string; attachment: SelectedDocument | null; document: ParsedDocument | null }
  | { type: "research_update"; stage: ResearchStage; events: AgentEvent[]; modelProgress?: number | null }
  | { type: "stop_research" }
  | {
      type: "fail";
      error: AtlasError;
      document?: ParsedDocument | null;
      chunks?: DocumentChunk[];
      extraction?: ExtractionAssessment | null;
    }
  | { type: "edit" }
  | { type: "reset" };

export const initialResearchState: ResearchState = {
  status: "composing",
  query: "",
  attachment: null,
  fieldError: null,
  notice: null,
};

export function queryError(query: string): AtlasError | null {
  const trimmed = query.trim();
  if (trimmed.length === 0) return atlasError("invalid_query");
  if (trimmed.length > MAX_QUERY_LENGTH) return atlasError("query_too_long");
  return null;
}

export interface SessionIdentity {
  sessionId: string;
  messageId: string;
  createdAt: number;
}

/** Builds an in-memory session when the user starts without a PDF. */
export function sessionWithoutDocument(query: string, identity: SessionIdentity): ResearchSession {
  return createResearchSession({
    ...identity,
    query,
    document: null,
    chunks: [],
    extraction: null,
  });
}

export function researchReducer(state: ResearchState, action: ResearchAction): ResearchState {
  switch (action.type) {
    case "set_query": {
      if (state.status !== "composing") return state;
      return { ...state, query: action.query, fieldError: null, notice: null };
    }
    case "attach": {
      if (state.status !== "composing") return state;
      return { ...state, attachment: action.attachment, fieldError: null };
    }
    case "attachment_rejected": {
      if (state.status !== "composing") return state;
      return { ...state, attachment: null, fieldError: action.error };
    }
    case "clear_attachment": {
      if (state.status !== "composing") return state;
      return { ...state, attachment: null, fieldError: null };
    }
    case "show_field_error": {
      if (state.status !== "composing") return state;
      return { ...state, fieldError: action.error };
    }
    case "begin_preparing": {
      if (state.status !== "composing" || !state.attachment) return state;
      const error = queryError(state.query);
      if (error) return { ...state, fieldError: error };
      return {
        status: "preparing",
        query: state.query.trim(),
        attachment: state.attachment,
        phase: "reading",
        detail: null,
      };
    }
    case "set_phase": {
      if (state.status !== "preparing") return state;
      return {
        ...state,
        phase: action.phase,
        detail: action.detail ? { ...state.detail, ...action.detail } : state.detail,
      };
    }
    case "session_ready":
      return { status: "ready", session: action.session };
    case "begin_research":
      return {
        status: "researching",
        query: action.query,
        attachment: action.attachment,
        document: action.document,
        stage: "loading_model",
        events: [],
        modelProgress: null,
      };
    case "research_update": {
      if (state.status !== "researching") return state;
      return {
        ...state,
        stage: action.stage,
        events: action.events,
        modelProgress: action.modelProgress === undefined ? state.modelProgress : action.modelProgress,
      };
    }
    case "stop_research": {
      const query = state.status === "ready" ? state.session.query : state.query;
      const attachment =
        state.status === "composing" || state.status === "preparing" || state.status === "researching" || state.status === "error"
          ? state.attachment
          : null;
      return { status: "composing", query, attachment, fieldError: null, notice: "Research stopped." };
    }
    case "fail": {
      const query = state.status === "ready" ? state.session.query : state.query;
      const attachment =
        state.status === "composing" ||
        state.status === "preparing" ||
        state.status === "researching" ||
        state.status === "error"
          ? state.attachment
          : null;
      return {
        status: "error",
        query,
        attachment,
        error: action.error,
        document: action.document ?? null,
        chunks: action.chunks ?? [],
        extraction: action.extraction ?? null,
      };
    }
    case "edit": {
      if (state.status === "composing") return state;
      const query = state.status === "ready" ? state.session.query : state.query;
      const attachment =
        state.status === "error" || state.status === "researching" || state.status === "preparing"
          ? state.attachment
          : state.status === "ready" && state.session.sourceFile && state.session.document
            ? {
                name: state.session.document.name,
                size: state.session.sourceFile.size,
                file: state.session.sourceFile,
              }
            : null;
      return { status: "composing", query, attachment, fieldError: null, notice: null };
    }
    case "reset": {
      if (state.status === "ready" && state.session.sourceFile && state.session.document) {
        return {
          status: "composing",
          query: "",
          attachment: {
            name: state.session.document.name,
            size: state.session.sourceFile.size,
            file: state.session.sourceFile,
          },
          fieldError: null,
          notice: null,
        };
      }
      return initialResearchState;
    }
    default:
      return state;
  }
}
