import { LOCAL_LLM_CONFIG, type LlmDtype } from "@/config/llm";
import type { EmbeddingDevice, ModelLoadProgress } from "@/lib/embeddings/engine";
import type { LlmGenerateRequest, LlmGenerateResult } from "@/lib/llm/engine";

interface ChatMessage {
  role: string;
  content: string;
}

interface GenerationOutput {
  generated_text?: string | ChatMessage[];
}

type GenerateFn = (
  messages: ChatMessage[],
  options: Record<string, unknown>,
) => Promise<GenerationOutput[] | GenerationOutput>;

export interface LoadedGenerator {
  readonly modelId: string;
  readonly device: EmbeddingDevice;
  readonly dtype: LlmDtype;
  generate(
    request: LlmGenerateRequest,
    onToken: (text: string) => void,
    isCancelled: () => boolean,
  ): Promise<LlmGenerateResult>;
  dispose(): Promise<void>;
}

function textFromOutput(output: GenerationOutput[] | GenerationOutput): string {
  const first = Array.isArray(output) ? output[0] : output;
  const generated = first?.generated_text;
  if (typeof generated === "string") return generated;
  if (!Array.isArray(generated)) return "";
  const assistant = [...generated].reverse().find((message) => message.role === "assistant");
  return typeof assistant?.content === "string" ? assistant.content : "";
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
    return { status, file: info.file, progress: info.progress, loaded: info.loaded, total: info.total };
  }
  return { status: "download", file: info.file };
}

/**
 * Loads the instruction model. Called from the LLM worker,
 * or on the main thread only when Worker is unavailable.
 */
export async function loadGenerator(
  device: EmbeddingDevice,
  dtype: LlmDtype,
  onProgress?: (progress: ModelLoadProgress) => void,
): Promise<LoadedGenerator> {
  const { env, pipeline, TextStreamer, InterruptableStoppingCriteria } = await import(
    "@huggingface/transformers"
  );
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  env.useFSCache = false;
  if (env.backends.onnx.wasm) {
    env.backends.onnx.wasm.numThreads = 1;
  }

  const generator = (await pipeline("text-generation", LOCAL_LLM_CONFIG.modelId, {
    device,
    dtype,
    progress_callback: (info: { status: string; file?: string; progress?: number; loaded?: number; total?: number }) => {
      onProgress?.(toProgress(info));
    },
  })) as GenerateFn & { tokenizer: ConstructorParameters<typeof TextStreamer>[0]; dispose: () => Promise<void> };

  return {
    modelId: LOCAL_LLM_CONFIG.modelId,
    device,
    dtype,
    async generate(request, onToken, isCancelled) {
      const stopping = new InterruptableStoppingCriteria();
      let tokens = 0;
      let streamed = "";
      const streamer = new TextStreamer(generator.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (text: string) => {
          if (isCancelled()) stopping.interrupt();
          if (text.length > 0) {
            tokens += 1;
            streamed += text;
            onToken(text);
          }
        },
      });

      if (isCancelled()) return { text: "", tokenCount: 0 };

      const output = await generator(
        [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
        {
          max_new_tokens: request.maxNewTokens,
          temperature: request.doSample ? request.temperature : 1,
          top_p: request.topP,
          repetition_penalty: request.repetitionPenalty,
          do_sample: request.doSample,
          return_full_text: false,
          streamer,
          stopping_criteria: stopping,
        },
      );

      const text = textFromOutput(output).trim() || streamed.trim();
      return { text, tokenCount: tokens };
    },
    async dispose() {
      await generator.dispose();
    },
  };
}
