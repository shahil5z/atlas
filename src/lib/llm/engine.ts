import type { EmbeddingDevice, ModelLoadProgress } from "@/lib/embeddings/engine";
import type { LlmDtype } from "@/config/llm";

export type LlmEngineState = "idle" | "loading" | "ready" | "generating" | "error" | "disposing";

export interface LlmGenerateRequest {
  system: string;
  user: string;
  maxNewTokens: number;
  temperature: number;
  topP: number;
  repetitionPenalty: number;
  doSample: boolean;
}

export interface LlmGenerateResult {
  text: string;
  tokenCount: number | null;
}

/**
 * Model-agnostic generation boundary.
 * Agents depend on this interface, not on Transformers.js.
 */
export interface LocalLlmEngine {
  readonly modelId: string;
  readonly device: EmbeddingDevice | null;
  readonly dtype: LlmDtype | null;
  readonly state: LlmEngineState;
  initialize(options: {
    device: EmbeddingDevice;
    dtype: LlmDtype;
    onProgress?: (progress: ModelLoadProgress) => void;
  }): Promise<void>;
  generate(
    request: LlmGenerateRequest,
    handlers?: {
      onToken?: (text: string) => void;
      signal?: AbortSignal;
    },
  ): Promise<LlmGenerateResult>;
  cancel(): void;
  dispose(): Promise<void>;
}
