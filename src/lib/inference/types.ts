/**
 * Browser-local generation. `LocalLlmEngine` is the implementation.
 * `context` in `GenerationRequest` is untrusted document data.
 */
export interface GenerationRequest {
  prompt: string;
  context: readonly string[];
  maxNewTokens: number;
}

export interface GenerationResult {
  text: string;
  tokenCount: number | null;
}

export interface LocalInferenceEngine {
  readonly id: string;
  readonly runtime: "webgpu" | "wasm";
  initialize(): Promise<void>;
  embed(texts: readonly string[]): Promise<Float32Array[]>;
  generate(request: GenerationRequest): Promise<GenerationResult>;
  dispose(): Promise<void>;
}

/** Phase 1 flag. UI copy uses this so it cannot claim a model is loaded. */
export const LOCAL_INFERENCE_IMPLEMENTED = true;
