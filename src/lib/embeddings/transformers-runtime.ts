import {
  EMBEDDING_DIMENSION,
  EMBEDDING_DTYPE,
  EMBEDDING_MODEL_ID,
} from "@/config/embedding";
import type { EmbeddingDevice, ModelLoadProgress } from "@/lib/embeddings/engine";

export interface LoadedEmbedder {
  readonly modelId: string;
  readonly dimension: number;
  readonly device: EmbeddingDevice;
  embed(texts: readonly string[]): Promise<Float32Array[]>;
  dispose(): Promise<void>;
}

interface ExtractionTensor {
  dims: number[];
  data: ArrayLike<number>;
  dispose?: () => void;
}

interface ExtractionPipeline {
  (texts: string | string[], options?: { pooling?: "mean"; normalize?: boolean }): Promise<ExtractionTensor>;
  dispose(): Promise<void>;
}

function vectorsFromTensor(tensor: ExtractionTensor): Float32Array[] {
  const dimension = tensor.dims[tensor.dims.length - 1] ?? 0;
  const count = tensor.dims.length <= 1 ? 1 : (tensor.dims[0] ?? 0);
  if (dimension <= 0 || count <= 0) return [];

  const source =
    tensor.data instanceof Float32Array ? tensor.data : Float32Array.from(tensor.data);
  const vectors: Float32Array[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = index * dimension;
    vectors.push(source.slice(start, start + dimension));
  }
  return vectors;
}

/**
 * Loads the sentence embedding model. Called from the embedding worker,
 * or on the main thread only when Worker is unavailable.
 * Model files may be cached by the browser. User documents are not.
 */
export async function loadEmbedder(
  device: EmbeddingDevice,
  onProgress?: (progress: ModelLoadProgress) => void,
): Promise<LoadedEmbedder> {
  const { env, pipeline } = await import("@huggingface/transformers");
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  env.useFSCache = false;
  if (env.backends.onnx.wasm) {
    env.backends.onnx.wasm.numThreads = 1;
  }

  const extractor = (await pipeline("feature-extraction", EMBEDDING_MODEL_ID, {
    device,
    dtype: EMBEDDING_DTYPE,
    progress_callback: (info) => {
      onProgress?.(toProgress(info));
    },
  })) as ExtractionPipeline;

  const probe = await extractor("atlas", { pooling: "mean", normalize: true });
  const dimension = probe.dims[probe.dims.length - 1] ?? EMBEDDING_DIMENSION;
  probe.dispose?.();

  return {
    modelId: EMBEDDING_MODEL_ID,
    dimension,
    device,
    async embed(texts) {
      if (texts.length === 0) return [];
      const tensor = await extractor(texts.length === 1 ? texts[0]! : [...texts], {
        pooling: "mean",
        normalize: true,
      });
      try {
        return vectorsFromTensor(tensor);
      } finally {
        tensor.dispose?.();
      }
    },
    async dispose() {
      await extractor.dispose();
    },
  };
}

function toProgress(info: {
  status: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}): ModelLoadProgress {
  const status = info.status;
  if (
    status === "initiate" ||
    status === "download" ||
    status === "progress" ||
    status === "done" ||
    status === "ready" ||
    status === "progress_total"
  ) {
    return {
      status,
      file: info.file,
      progress: info.progress,
      loaded: info.loaded,
      total: info.total,
    };
  }
  return { status: "download", file: info.file };
}
