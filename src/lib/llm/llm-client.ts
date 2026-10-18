import { LOCAL_LLM_CONFIG, type LlmDtype } from "@/config/llm";
import type { EmbeddingDevice, ModelLoadProgress } from "@/lib/embeddings/engine";
import { atlasError } from "@/lib/errors/atlas-error";
import { toAtlasError } from "@/lib/errors/to-atlas-error";
import type { LlmEngineState, LlmGenerateRequest, LlmGenerateResult, LocalLlmEngine } from "@/lib/llm/engine";
import { ResearchCancelled } from "@/lib/llm/cancelled";
import type { LlmWorkerEvent, LlmWorkerRequest } from "@/lib/llm/worker-protocol";
import { detectRuntimeCapabilities } from "@/lib/runtime/capabilities";

type WorkerRequestBody = LlmWorkerRequest extends infer Request
  ? Request extends LlmWorkerRequest
    ? Omit<Request, "id">
    : never
  : never;

interface PendingRequest {
  resolve: (event: LlmWorkerEvent) => void;
  reject: (error: Error) => void;
  onToken: ((text: string) => void) | null;
}

class WorkerLlmEngine implements LocalLlmEngine {
  readonly modelId = LOCAL_LLM_CONFIG.modelId;
  device: EmbeddingDevice | null = null;
  dtype: LlmDtype | null = null;
  state: LlmEngineState = "idle";

  private worker: Worker | null = null;
  private pending = new Map<string, PendingRequest>();
  private progress: ((progress: ModelLoadProgress) => void) | null = null;
  private activeId: string | null = null;

  async initialize(options: {
    device: EmbeddingDevice;
    dtype: LlmDtype;
    onProgress?: (progress: ModelLoadProgress) => void;
  }): Promise<void> {
    if (this.state === "ready" && this.device === options.device && this.dtype === options.dtype) return;
    this.state = "loading";
    this.progress = options.onProgress ?? null;
    try {
      const event = await this.send({ type: "initialize", device: options.device, dtype: options.dtype });
      if (event.type !== "ready") throw new Error("The local model did not become ready.");
      this.device = event.device;
      this.dtype = event.dtype;
      this.state = "ready";
    } catch (error) {
      this.state = "error";
      throw error;
    } finally {
      this.progress = null;
    }
  }

  async generate(
    request: LlmGenerateRequest,
    handlers?: { onToken?: (text: string) => void; signal?: AbortSignal },
  ): Promise<LlmGenerateResult> {
    if (this.state !== "ready" && this.state !== "generating") throw atlasError("generation_failed");
    if (handlers?.signal?.aborted) throw new ResearchCancelled();
    this.state = "generating";
    const onAbort = () => this.cancel();
    handlers?.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const event = await this.send({ type: "generate", request }, handlers?.onToken);
      if (event.type === "cancelled" || handlers?.signal?.aborted) throw new ResearchCancelled();
      if (event.type !== "complete") throw atlasError("generation_failed");
      this.state = "ready";
      return { text: event.text, tokenCount: event.tokenCount };
    } catch (error) {
      if (this.state === "generating") this.state = "ready";
      throw error;
    } finally {
      handlers?.signal?.removeEventListener("abort", onAbort);
    }
  }

  cancel(): void {
    if (!this.worker || !this.activeId) return;
    this.worker.postMessage({ id: crypto.randomUUID(), type: "cancel" } satisfies LlmWorkerRequest);
  }

  async dispose(): Promise<void> {
    this.state = "disposing";
    try {
      if (this.worker) await this.send({ type: "dispose" });
    } catch {
      // The worker is terminated either way.
    } finally {
      this.worker?.terminate();
      this.worker = null;
      this.rejectAll(new Error("Local model disposed."));
      this.device = null;
      this.dtype = null;
      this.state = "idle";
      this.activeId = null;
    }
  }

  private async send(message: WorkerRequestBody, onToken?: (text: string) => void): Promise<LlmWorkerEvent> {
    const worker = this.ensureWorker();
    const id = crypto.randomUUID();
    if (message.type === "generate") this.activeId = id;
    const event = await new Promise<LlmWorkerEvent>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onToken: onToken ?? null });
      worker.postMessage({ ...message, id });
    });
    if (this.activeId === id) this.activeId = null;
    if (event.type === "error") throw new Error(event.message);
    return event;
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    this.worker = new Worker(new URL("../../workers/llm.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<LlmWorkerEvent>) => {
      const data = event.data;
      if (data.type === "progress") {
        this.progress?.(data.progress);
        return;
      }
      const pending = this.pending.get(data.id);
      if (!pending) return;
      if (data.type === "token") {
        pending.onToken?.(data.text);
        return;
      }
      this.pending.delete(data.id);
      pending.resolve(data);
    };
    this.worker.onerror = () => {
      this.rejectAll(new Error("Local model worker failed."));
      this.worker?.terminate();
      this.worker = null;
      this.state = "error";
    };
    return this.worker;
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

class LocalLlmFallback implements LocalLlmEngine {
  readonly modelId = LOCAL_LLM_CONFIG.modelId;
  device: EmbeddingDevice | null = null;
  dtype: LlmDtype | null = null;
  state: LlmEngineState = "idle";
  private loaded: Awaited<ReturnType<typeof import("@/lib/llm/transformers-runtime").loadGenerator>> | null = null;
  private cancelled = false;

  async initialize(options: {
    device: EmbeddingDevice;
    dtype: LlmDtype;
    onProgress?: (progress: ModelLoadProgress) => void;
  }): Promise<void> {
    if (this.state === "ready" && this.device === options.device && this.dtype === options.dtype) return;
    this.state = "loading";
    try {
      const { loadGenerator } = await import("@/lib/llm/transformers-runtime");
      await this.loaded?.dispose();
      this.loaded = await loadGenerator(options.device, options.dtype, options.onProgress);
      this.device = this.loaded.device;
      this.dtype = this.loaded.dtype;
      this.state = "ready";
    } catch (error) {
      this.state = "error";
      throw error;
    }
  }

  async generate(request: LlmGenerateRequest, handlers?: { onToken?: (text: string) => void; signal?: AbortSignal }): Promise<LlmGenerateResult> {
    if (!this.loaded || (this.state !== "ready" && this.state !== "generating")) throw atlasError("generation_failed");
    if (handlers?.signal?.aborted) throw new ResearchCancelled();
    this.state = "generating";
    this.cancelled = false;
    const onAbort = () => this.cancel();
    handlers?.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const result = await this.loaded.generate(request, (text) => handlers?.onToken?.(text), () => this.cancelled || Boolean(handlers?.signal?.aborted));
      if (this.cancelled || handlers?.signal?.aborted) throw new ResearchCancelled();
      this.state = "ready";
      return result;
    } catch (error) {
      if (this.state === "generating") this.state = "ready";
      throw error;
    } finally {
      handlers?.signal?.removeEventListener("abort", onAbort);
    }
  }

  cancel(): void {
    this.cancelled = true;
  }

  async dispose(): Promise<void> {
    this.state = "disposing";
    await this.loaded?.dispose();
    this.loaded = null;
    this.device = null;
    this.dtype = null;
    this.state = "idle";
  }
}

let current: LocalLlmEngine | null = null;
let probed = false;
let resolved: { device: EmbeddingDevice; dtype: LlmDtype } | null = null;

async function outputIsUsable(engine: LocalLlmEngine): Promise<boolean> {
  const result = await engine.generate({
    system: "You answer in English.",
    user: "Reply with the single word ready.",
    maxNewTokens: 12,
    temperature: 0,
    doSample: false,
    topP: 1,
    repetitionPenalty: 1,
  });
  return /ready/i.test(result.text);
}

export function createLlmEngine(): LocalLlmEngine {
  if (typeof Worker === "function") return new WorkerLlmEngine();
  return new LocalLlmFallback();
}

export function getLlmEngine(): LocalLlmEngine {
  current ??= createLlmEngine();
  return current;
}

let llmInit: Promise<LocalLlmEngine> | null = null;

export async function initializeLlmEngine(
  onProgress?: (progress: ModelLoadProgress) => void,
): Promise<LocalLlmEngine> {
  if (current && probed && resolved && (current.state === "ready" || current.state === "generating")) {
    return current;
  }
  if (llmInit) return llmInit;
  llmInit = initializeLlmEngineOnce(onProgress).finally(() => {
    llmInit = null;
  });
  return llmInit;
}

async function initializeLlmEngineOnce(
  onProgress?: (progress: ModelLoadProgress) => void,
): Promise<LocalLlmEngine> {
  const capabilities = await detectRuntimeCapabilities();
  if (!capabilities.webgpu && !capabilities.wasm) throw atlasError("unsupported_runtime");

  const preferred: EmbeddingDevice = capabilities.webgpu ? "webgpu" : "wasm";
  const dtype: LlmDtype = preferred === "wasm" ? LOCAL_LLM_CONFIG.wasmDtype : LOCAL_LLM_CONFIG.dtype;
  const engine = getLlmEngine();

  const loadWasmFallback = async () => {
    await engine.dispose();
    current = null;
    probed = false;
    const fallback = getLlmEngine();
    await fallback.initialize({ device: "wasm", dtype: LOCAL_LLM_CONFIG.wasmDtype, onProgress });
    if (!(await outputIsUsable(fallback))) throw atlasError("llm_init_failed");
    probed = true;
    resolved = { device: "wasm", dtype: LOCAL_LLM_CONFIG.wasmDtype };
    return fallback;
  };

  if (resolved && probed) {
    await engine.initialize({ device: resolved.device, dtype: resolved.dtype, onProgress });
    return engine;
  }

  try {
    await engine.initialize({ device: preferred, dtype, onProgress });
    let usable = probed || (await outputIsUsable(engine));
    if (!usable && preferred === "webgpu") {
      await engine.initialize({ device: "webgpu", dtype: LOCAL_LLM_CONFIG.wasmDtype, onProgress });
      usable = await outputIsUsable(engine);
      if (!usable) return await loadWasmFallback();
    } else if (!usable) {
      throw atlasError("llm_init_failed");
    }
    probed = true;
    resolved = { device: engine.device ?? preferred, dtype: engine.dtype ?? dtype };
    return engine;
  } catch (error) {
    if (preferred !== "webgpu") throw toAtlasError(error, "llm");
    try {
      return await loadWasmFallback();
    } catch (fallbackError) {
      throw toAtlasError(fallbackError, "llm");
    }
  }
}

export async function disposeLlmEngine(): Promise<void> {
  const engine = current;
  current = null;
  probed = false;
  resolved = null;
  llmInit = null;
  await engine?.dispose();
}
