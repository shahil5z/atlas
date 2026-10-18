import type { EmbeddingDevice, ModelLoadProgress } from "@/lib/embeddings/engine";
import type { LlmDtype } from "@/config/llm";
import type { LlmGenerateRequest } from "@/lib/llm/engine";

export type LlmWorkerRequest =
  | { id: string; type: "initialize"; device: EmbeddingDevice; dtype: LlmDtype }
  | { id: string; type: "generate"; request: LlmGenerateRequest }
  | { id: string; type: "cancel" }
  | { id: string; type: "dispose" };

export function isLlmWorkerRequest(value: unknown): value is LlmWorkerRequest {
  if (typeof value !== "object" || value === null) return false;
  const message = value as { id?: unknown; type?: unknown; device?: unknown; dtype?: unknown; request?: unknown };
  if (typeof message.id !== "string" || message.id.length === 0) return false;
  if (message.type === "cancel" || message.type === "dispose") return true;
  if (message.type === "initialize") {
    return (message.device === "webgpu" || message.device === "wasm") && (message.dtype === "q4f16" || message.dtype === "q4");
  }
  if (message.type !== "generate" || typeof message.request !== "object" || message.request === null) return false;
  const request = message.request as { system?: unknown; user?: unknown; maxNewTokens?: unknown; temperature?: unknown; topP?: unknown; repetitionPenalty?: unknown; doSample?: unknown };
  return (
    typeof request.system === "string" &&
    typeof request.user === "string" &&
    typeof request.maxNewTokens === "number" &&
    Number.isFinite(request.maxNewTokens) &&
    typeof request.temperature === "number" &&
    typeof request.topP === "number" &&
    typeof request.repetitionPenalty === "number" &&
    typeof request.doSample === "boolean"
  );
}

export type LlmWorkerEvent =
  | { id: string; type: "progress"; progress: ModelLoadProgress }
  | { id: string; type: "ready"; modelId: string; device: EmbeddingDevice; dtype: LlmDtype }
  | { id: string; type: "token"; text: string }
  | { id: string; type: "complete"; text: string; tokenCount: number | null }
  | { id: string; type: "cancelled" }
  | { id: string; type: "disposed" }
  | { id: string; type: "error"; message: string };
