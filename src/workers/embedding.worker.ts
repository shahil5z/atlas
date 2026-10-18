import { loadEmbedder, type LoadedEmbedder } from "@/lib/embeddings/transformers-runtime";
import { isEmbeddingWorkerRequest, type EmbeddingWorkerEvent, type EmbeddingWorkerRequest } from "@/lib/embeddings/worker-protocol";

interface WorkerScope {
  onmessage: ((event: MessageEvent<EmbeddingWorkerRequest>) => void) | null;
  postMessage(message: EmbeddingWorkerEvent, transfer?: Transferable[]): void;
}

const scope = globalThis as unknown as WorkerScope;
let embedder: LoadedEmbedder | null = null;

scope.onmessage = (event) => {
  void handle(event.data);
};

function workerError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Embedding worker failed.";
  return message.slice(0, 180);
}

async function handle(message: EmbeddingWorkerRequest): Promise<void> {
  if (!isEmbeddingWorkerRequest(message)) return;
  try {
    if (message.type === "initialize") {
      if (embedder?.device === message.device) {
        scope.postMessage({
          id: message.id,
          type: "ready",
          modelId: embedder.modelId,
          dimension: embedder.dimension,
          device: embedder.device,
        });
        return;
      }

      await embedder?.dispose();
      embedder = null;
      embedder = await loadEmbedder(message.device, (progress) => {
        scope.postMessage({ id: message.id, type: "progress", progress });
      });
      scope.postMessage({
        id: message.id,
        type: "ready",
        modelId: embedder.modelId,
        dimension: embedder.dimension,
        device: embedder.device,
      });
      return;
    }

    if (message.type === "dispose") {
      await embedder?.dispose();
      embedder = null;
      scope.postMessage({ id: message.id, type: "disposed" });
      return;
    }

    if (!embedder) {
      scope.postMessage({ id: message.id, type: "error", message: "The embedding model is not ready." });
      return;
    }

    const vectors = await embedder.embed(message.texts);
    const dimension = embedder.dimension;
    const packed = new Float32Array(vectors.length * dimension);
    vectors.forEach((vector, index) => {
      packed.set(vector.subarray(0, dimension), index * dimension);
    });
    scope.postMessage(
      { id: message.id, type: "embeddings", count: vectors.length, dimension, vectors: packed },
      [packed.buffer],
    );
  } catch (error) {
    scope.postMessage({
      id: message.id,
      type: "error",
      message: workerError(error),
    });
  }
}
