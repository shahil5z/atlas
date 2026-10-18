import {
  MAX_REASONABLE_DEVICE_MEMORY_GB,
  MAX_REASONABLE_HARDWARE_CONCURRENCY,
} from "@/config/runtime";
import type { RecommendedRuntime, RuntimeCapabilities, RuntimeSignals } from "@/types/runtime";

function asBoolean(value: unknown): boolean {
  return value === true;
}

function normalizeHardwareConcurrency(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 1 || value > MAX_REASONABLE_HARDWARE_CONCURRENCY) return null;
  return value;
}

function normalizeDeviceMemory(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 0 || value > MAX_REASONABLE_DEVICE_MEMORY_GB) return null;
  return value;
}

export function normalizeRuntimeCapabilities(signals: RuntimeSignals): RuntimeCapabilities {
  const webgpu = asBoolean(signals.webgpu);
  const wasm = asBoolean(signals.wasm);
  const workers = asBoolean(signals.workers);

  let recommendedRuntime: RecommendedRuntime = "unsupported";
  if (webgpu) recommendedRuntime = "webgpu";
  else if (wasm) recommendedRuntime = "wasm";

  return {
    webgpu,
    wasm,
    workers,
    recommendedRuntime,
    hardwareConcurrency: normalizeHardwareConcurrency(signals.hardwareConcurrency),
    deviceMemoryGb: normalizeDeviceMemory(signals.deviceMemoryGb),
  };
}

function detectWasm(): boolean {
  try {
    if (typeof WebAssembly === "undefined" || typeof WebAssembly.validate !== "function") {
      return false;
    }
    // Minimal valid WebAssembly module: magic + version. Nothing is instantiated.
    const header = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    return WebAssembly.validate(header);
  } catch {
    return false;
  }
}

function detectWorkers(): boolean {
  return typeof Worker === "function";
}

function readDeviceMemory(): number | null {
  if (typeof navigator === "undefined") return null;
  const candidate = navigator as Navigator & { deviceMemory?: unknown };
  return typeof candidate.deviceMemory === "number" ? candidate.deviceMemory : null;
}

interface BrowserGpu {
  requestAdapter: () => Promise<unknown>;
}

async function detectWebGpu(): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  const gpu = (navigator as Navigator & { gpu?: BrowserGpu }).gpu;
  if (!gpu) return false;

  try {
    const adapter = await gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

/**
 * Conservative capability probe. Runs only in the browser, after mount,
 * so server rendering never touches WebGPU.
 */
export async function detectRuntimeCapabilities(): Promise<RuntimeCapabilities> {
  const webgpu = await detectWebGpu();

  return normalizeRuntimeCapabilities({
    webgpu,
    wasm: detectWasm(),
    workers: detectWorkers(),
    hardwareConcurrency:
      typeof navigator === "undefined" ? null : navigator.hardwareConcurrency,
    deviceMemoryGb: readDeviceMemory(),
  });
}

export function runtimeStatusFromCapabilities(
  capabilities: RuntimeCapabilities,
): "ready" | "limited" | "unsupported" {
  if (capabilities.recommendedRuntime === "webgpu") return "ready";
  if (capabilities.recommendedRuntime === "wasm") return "limited";
  return "unsupported";
}
