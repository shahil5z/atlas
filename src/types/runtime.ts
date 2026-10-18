export type RecommendedRuntime = "webgpu" | "wasm" | "unsupported";

export type RuntimeStatus = "detecting" | "ready" | "limited" | "unsupported";

/**
 * Capability snapshot. Hardware fields are included only when the browser
 * exposes them. GPU VRAM is intentionally absent.
 */
export interface RuntimeCapabilities {
  webgpu: boolean;
  wasm: boolean;
  workers: boolean;
  recommendedRuntime: RecommendedRuntime;
  hardwareConcurrency: number | null;
  deviceMemoryGb: number | null;
}

export type RuntimeState =
  | { status: "detecting" }
  | {
      status: Exclude<RuntimeStatus, "detecting">;
      capabilities: RuntimeCapabilities;
    };

export interface RuntimeSignals {
  webgpu: unknown;
  wasm: unknown;
  workers: unknown;
  hardwareConcurrency: unknown;
  deviceMemoryGb: unknown;
}
