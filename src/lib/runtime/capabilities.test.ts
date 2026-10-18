import { describe, expect, it } from "vitest";
import { normalizeRuntimeCapabilities } from "@/lib/runtime/capabilities";

const base = {
  webgpu: false,
  wasm: false,
  workers: false,
  hardwareConcurrency: null,
  deviceMemoryGb: null,
};

describe("normalizeRuntimeCapabilities", () => {
  it("recommends WebGPU when it is available", () => {
    const result = normalizeRuntimeCapabilities({ ...base, webgpu: true, wasm: true, workers: true });
    expect(result.recommendedRuntime).toBe("webgpu");
    expect(result.webgpu).toBe(true);
  });

  it("falls back to WASM when WebGPU is unavailable", () => {
    const result = normalizeRuntimeCapabilities({ ...base, wasm: true, workers: false });
    expect(result).toMatchObject({
      webgpu: false,
      wasm: true,
      workers: false,
      recommendedRuntime: "wasm",
    });
  });

  it("marks the runtime unsupported when WebGPU and WASM are both missing", () => {
    const result = normalizeRuntimeCapabilities(base);
    expect(result.recommendedRuntime).toBe("unsupported");
  });

  it("drops hardware numbers the browser did not actually provide", () => {
    const result = normalizeRuntimeCapabilities({
      webgpu: "yes",
      wasm: 1,
      workers: true,
      hardwareConcurrency: 0.5,
      deviceMemoryGb: 10_000,
    });

    expect(result.webgpu).toBe(false);
    expect(result.wasm).toBe(false);
    expect(result.workers).toBe(true);
    expect(result.hardwareConcurrency).toBeNull();
    expect(result.deviceMemoryGb).toBeNull();
    expect(result.recommendedRuntime).toBe("unsupported");
  });

  it("keeps browser-reported memory and processor counts inside a sane range", () => {
    const result = normalizeRuntimeCapabilities({
      ...base,
      wasm: true,
      hardwareConcurrency: 8,
      deviceMemoryGb: 8,
    });

    expect(result.hardwareConcurrency).toBe(8);
    expect(result.deviceMemoryGb).toBe(8);
  });
});
