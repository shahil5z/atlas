import type { EmbeddingDevice, ModelLoadProgress } from "@/lib/embeddings/engine";

export type EmbeddingWorkerRequest =
  | { id: string; type: "initialize"; device: EmbeddingDevice }
  | { id: string; type: "embed"; texts: string[] }
  | { id: string; type: "dispose" };

export function isEmbeddingWorkerRequest(value: unknown): value is EmbeddingWorkerRequest {
  if (typeof value !== "object" || value === null) return false;
  const message = value as { id?: unknown; type?: unknown; device?: unknown; texts?: unknown };
  if (typeof message.id !== "string" || message.id.length === 0) return false;
  if (message.type === "dispose") return true;
  if (message.type === "initialize") return message.device === "webgpu" || message.device === "wasm";
  if (message.type === "embed") {
    return Array.isArray(message.texts) && message.texts.every((item) => typeof item === "string");
  }
  return false;
}

export type EmbeddingWorkerEvent =
  | { id: string; type: "progress"; progress: ModelLoadProgress }
  | { id: string; type: "ready"; modelId: string; dimension: number; device: EmbeddingDevice }
  | { id: string; type: "embeddings"; count: number; dimension: number; vectors: Float32Array }
  | { id: string; type: "disposed" }
  | { id: string; type: "error"; message: string };
