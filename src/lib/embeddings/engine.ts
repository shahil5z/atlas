export type EmbeddingDevice = "webgpu" | "wasm";

export type EmbeddingEngineState = "idle" | "loading" | "ready" | "error" | "disposing";

export interface ModelLoadProgress {
  status: "initiate" | "download" | "progress" | "done" | "ready" | "progress_total";
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

/**
 * Model-agnostic embedding boundary.
 * Retrieval code depends on this interface, not on Transformers.js.
 */
export interface EmbeddingEngine {
  readonly modelId: string;
  readonly dimension: number | null;
  readonly device: EmbeddingDevice | null;
  readonly state: EmbeddingEngineState;
  initialize(options: {
    device: EmbeddingDevice;
    onProgress?: (progress: ModelLoadProgress) => void;
  }): Promise<void>;
  embed(text: string): Promise<Float32Array>;
  embedBatch(
    texts: readonly string[],
    onProgress?: (completed: number, total: number) => void,
  ): Promise<Float32Array[]>;
  dispose(): Promise<void>;
}
