import type { EmbeddingDevice } from "@/lib/embeddings/engine";

/**
 * Browser-local instruction model.
 * Device is chosen at runtime. This object is the only model id the agents read.
 *
 * SmolLM2-360M-Instruct, q4f16, is one ONNX file of about 272 MB.
 * Apache-2.0. About 360 million parameters. Context window is 8,192 tokens.
 * q4f16 is the WebGPU-oriented quant. A one-word readiness check runs after load. If it fails, Atlas tries q4 on WebGPU, then q4 on WASM (about 386 MB).
 */
export const LOCAL_LLM_CONFIG = {
  modelId: "onnx-community/SmolLM2-360M-Instruct-ONNX",
  dtype: "q4f16",
  wasmDtype: "q4",
  contextLength: 8_192,
  maxNewTokens: 360,
  structuredMaxNewTokens: 220,
  temperature: 0.3,
  structuredTemperature: 0,
  topP: 0.9,
  repetitionPenalty: 1.05,
} as const;

export type LlmDtype = typeof LOCAL_LLM_CONFIG.dtype | typeof LOCAL_LLM_CONFIG.wasmDtype;

export interface ResolvedLlmConfig {
  modelId: string;
  dtype: LlmDtype;
  device: EmbeddingDevice;
  maxNewTokens: number;
  contextLength: number;
}

export const SYSTEM_TOKEN_BUDGET = 450;
export const QUERY_TOKEN_BUDGET = 350;
export const EVIDENCE_TOKEN_BUDGET = 900;
export const OUTPUT_TOKEN_BUDGET = LOCAL_LLM_CONFIG.maxNewTokens;
