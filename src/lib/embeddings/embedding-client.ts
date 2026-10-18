import { EMBED_BATCH_SIZE, EMBEDDING_MODEL_ID } from "@/config/embedding";
import type {
  EmbeddingDevice,
  EmbeddingEngine,
  EmbeddingEngineState,
  ModelLoadProgress,
} from "@/lib/embeddings/engine";
import { clearResearchIndex } from "@/lib/embeddings/vector-index";
import type { EmbeddingWorkerEvent, EmbeddingWorkerRequest } from "@/lib/embeddings/worker-protocol";
import { detectRuntimeCapabilities } from "@/lib/runtime/capabilities";
import { atlasError } from "@/lib/errors/atlas-error";
import { toAtlasError } from "@/lib/errors/to-atlas-error";

type WorkerRequestBody = EmbeddingWorkerRequest extends infer Request
  ? Request extends EmbeddingWorkerRequest
    ? Omit<Request, "id">
    : never
  : never;

interface PendingRequest {
  resolve: (event: EmbeddingWorkerEvent) => void;
  reject: (error: Error) => void;
}

class WorkerEmbeddingEngine implements EmbeddingEngine {
  readonly modelId = EMBEDDING_MODEL_ID;
  dimension: number | null = null;
  device: EmbeddingDevice | null = null;
  state: EmbeddingEngineState = "idle";

  private worker: Worker | null = null;
  private pending = new Map<string, PendingRequest>();
  private progress: ((progress: ModelLoadProgress) => void) | null = null;

  async initialize(options: {
    device: EmbeddingDevice;
    onProgress?: (progress: ModelLoadProgress) => void;
  }): Promise<void> {
    if (this.state === "ready" && this.device === options.device) return;
    this.state = "loading";
    this.progress = options.onProgress ?? null;
    try {
      const event = await this.send({ type: "initialize", device: options.device });
      if (event.type !== "ready") throw new Error("The embedding model did not become ready.");
      this.dimension = event.dimension;
      this.device = event.device;
      this.state = "ready";
    } catch (error) {
      this.state = "error";
      throw error;
    } finally {
      this.progress = null;
    }
  }

  async embed(text: string): Promise<Float32Array> {
    const [vector] = await this.embedBatch([text]);
    if (!vector) throw atlasError("embedding_failed");
    return vector;
  }

  async embedBatch(
    texts: readonly string[],
    onProgress?: (completed: number, total: number) => void,
  ): Promise<Float32Array[]> {
    if (this.state !== "ready") throw atlasError("embedding_failed");
    const vectors: Float32Array[] = [];
    for (let offset = 0; offset < texts.length; offset += EMBED_BATCH_SIZE) {
      const batch = texts.slice(offset, offset + EMBED_BATCH_SIZE);
      const event = await this.send({ type: "embed", texts: [...batch] });
      if (event.type !== "embeddings") throw atlasError("embedding_failed");
      vectors.push(...unpack(event.vectors, event.count, event.dimension));
      onProgress?.(Math.min(texts.length, offset + batch.length), texts.length);
    }
    return vectors;
  }

  async dispose(): Promise<void> {
    this.state = "disposing";
    try {
      if (this.worker) await this.send({ type: "dispose" });
    } catch {
      // The worker is about to be terminated either way.
    } finally {
      this.worker?.terminate();
      this.worker = null;
      this.rejectAll(new Error("Embedding worker disposed."));
      this.dimension = null;
      this.device = null;
      this.state = "idle";
    }
  }

  private async send(message: WorkerRequestBody): Promise<EmbeddingWorkerEvent> {
    const worker = this.ensureWorker();
    const id = crypto.randomUUID();
    const event = await new Promise<EmbeddingWorkerEvent>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ ...message, id });
    });
    if (event.type === "error") throw new Error(event.message);
    return event;
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    this.worker = new Worker(new URL("../../workers/embedding.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (event: MessageEvent<EmbeddingWorkerEvent>) => {
      const data = event.data;
      if (data.type === "progress") {
        this.progress?.(data.progress);
        return;
      }
      const pending = this.pending.get(data.id);
      if (!pending) return;
      this.pending.delete(data.id);
      pending.resolve(data);
    };
    this.worker.onerror = () => {
      this.rejectAll(new Error("Embedding worker failed."));
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

class LocalEmbeddingEngine implements EmbeddingEngine {
  readonly modelId = EMBEDDING_MODEL_ID;
  dimension: number | null = null;
  device: EmbeddingDevice | null = null;
  state: EmbeddingEngineState = "idle";
  private embedder: Awaited<ReturnType<typeof import("@/lib/embeddings/transformers-runtime").loadEmbedder>> | null =
    null;

  async initialize(options: {
    device: EmbeddingDevice;
    onProgress?: (progress: ModelLoadProgress) => void;
  }): Promise<void> {
    if (this.state === "ready" && this.device === options.device) return;
    this.state = "loading";
    try {
      const { loadEmbedder } = await import("@/lib/embeddings/transformers-runtime");
      await this.embedder?.dispose();
      this.embedder = await loadEmbedder(options.device, options.onProgress);
      this.dimension = this.embedder.dimension;
      this.device = this.embedder.device;
      this.state = "ready";
    } catch (error) {
      this.state = "error";
      throw error;
    }
  }

  async embed(text: string): Promise<Float32Array> {
    const [vector] = await this.embedBatch([text]);
    if (!vector) throw atlasError("embedding_failed");
    return vector;
  }

  async embedBatch(
    texts: readonly string[],
    onProgress?: (completed: number, total: number) => void,
  ): Promise<Float32Array[]> {
    if (!this.embedder || this.state !== "ready") throw atlasError("embedding_failed");
    const vectors: Float32Array[] = [];
    for (let offset = 0; offset < texts.length; offset += EMBED_BATCH_SIZE) {
      const batch = texts.slice(offset, offset + EMBED_BATCH_SIZE);
      vectors.push(...(await this.embedder.embed(batch)));
      onProgress?.(Math.min(texts.length, offset + batch.length), texts.length);
    }
    return vectors;
  }

  async dispose(): Promise<void> {
    this.state = "disposing";
    await this.embedder?.dispose();
    this.embedder = null;
    this.dimension = null;
    this.device = null;
    this.state = "idle";
  }
}

let current: EmbeddingEngine | null = null;

export function createEmbeddingEngine(): EmbeddingEngine {
  if (typeof Worker === "function") return new WorkerEmbeddingEngine();
  return new LocalEmbeddingEngine();
}

export function getEmbeddingEngine(): EmbeddingEngine {
  current ??= createEmbeddingEngine();
  return current;
}

let embeddingInit: Promise<EmbeddingEngine> | null = null;

export async function initializeEmbeddingEngine(
  onProgress?: (progress: ModelLoadProgress) => void,
): Promise<EmbeddingEngine> {
  const existing = getEmbeddingEngine();
  if (existing.state === "ready") return existing;
  if (embeddingInit) return embeddingInit;
  embeddingInit = initializeEmbeddingEngineOnce(onProgress).finally(() => {
    embeddingInit = null;
  });
  return embeddingInit;
}

async function initializeEmbeddingEngineOnce(
  onProgress?: (progress: ModelLoadProgress) => void,
): Promise<EmbeddingEngine> {
  const capabilities = await detectRuntimeCapabilities();
  if (!capabilities.webgpu && !capabilities.wasm) throw atlasError("unsupported_runtime");

  const preferred: EmbeddingDevice = capabilities.webgpu ? "webgpu" : "wasm";
  const engine = getEmbeddingEngine();

  try {
    await engine.initialize({ device: preferred, onProgress });
    return engine;
  } catch (error) {
    if (preferred !== "webgpu") throw toAtlasError(error, "model");
    await engine.dispose();
    current = null;
    const fallback = getEmbeddingEngine();
    try {
      await fallback.initialize({ device: "wasm", onProgress });
      return fallback;
    } catch (fallbackError) {
      throw toAtlasError(fallbackError, "model");
    }
  }
}

export async function disposeEmbeddingEngine(): Promise<void> {
  clearResearchIndex();
  const engine = current;
  current = null;
  embeddingInit = null;
  await engine?.dispose();
}

function unpack(packed: Float32Array, count: number, dimension: number): Float32Array[] {
  const vectors: Float32Array[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = index * dimension;
    vectors.push(packed.slice(start, start + dimension));
  }
  return vectors;
}
