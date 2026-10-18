import { loadGenerator, type LoadedGenerator } from "@/lib/llm/transformers-runtime";
import { isLlmWorkerRequest, type LlmWorkerEvent, type LlmWorkerRequest } from "@/lib/llm/worker-protocol";

interface WorkerScope {
  onmessage: ((event: MessageEvent<LlmWorkerRequest>) => void) | null;
  postMessage(message: LlmWorkerEvent): void;
}

const scope = globalThis as unknown as WorkerScope;
let generator: LoadedGenerator | null = null;
let cancelled = false;

scope.onmessage = (event) => {
  void handle(event.data);
};

function workerError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Local generation failed.";
  return message.slice(0, 180);
}

async function handle(message: LlmWorkerRequest): Promise<void> {
  if (!isLlmWorkerRequest(message)) return;
  try {
    if (message.type === "cancel") {
      cancelled = true;
      return;
    }

    if (message.type === "initialize") {
      if (generator && generator.device === message.device && generator.dtype === message.dtype) {
        scope.postMessage({
          id: message.id,
          type: "ready",
          modelId: generator.modelId,
          device: generator.device,
          dtype: generator.dtype,
        });
        return;
      }
      await generator?.dispose();
      generator = null;
      generator = await loadGenerator(message.device, message.dtype, (progress) => {
        scope.postMessage({ id: message.id, type: "progress", progress });
      });
      scope.postMessage({
        id: message.id,
        type: "ready",
        modelId: generator.modelId,
        device: generator.device,
        dtype: generator.dtype,
      });
      return;
    }

    if (message.type === "dispose") {
      await generator?.dispose();
      generator = null;
      scope.postMessage({ id: message.id, type: "disposed" });
      return;
    }

    if (!generator) {
      scope.postMessage({ id: message.id, type: "error", message: "The local model is not ready." });
      return;
    }

    cancelled = false;
    const result = await generator.generate(
      message.request,
      (text) => {
        scope.postMessage({ id: message.id, type: "token", text });
      },
      () => cancelled,
    );
    if (cancelled) {
      scope.postMessage({ id: message.id, type: "cancelled" });
      cancelled = false;
      return;
    }
    scope.postMessage({
      id: message.id,
      type: "complete",
      text: result.text,
      tokenCount: result.tokenCount,
    });
  } catch (error) {
    if (cancelled) {
      scope.postMessage({ id: message.id, type: "cancelled" });
      cancelled = false;
      return;
    }
    scope.postMessage({
      id: message.id,
      type: "error",
      message: workerError(error),
    });
  }
}
