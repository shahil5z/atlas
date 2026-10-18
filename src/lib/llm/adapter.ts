import { LOCAL_LLM_CONFIG } from "@/config/llm";
import type { LanguageModel } from "@/lib/agents/types";
import type { LocalLlmEngine } from "@/lib/llm/engine";

export function languageModelFromEngine(engine: LocalLlmEngine): LanguageModel {
  return {
    generate(input) {
      return engine.generate(
        {
          system: input.system,
          user: input.user,
          maxNewTokens: input.maxNewTokens,
          temperature: input.temperature,
          topP: LOCAL_LLM_CONFIG.topP,
          repetitionPenalty: LOCAL_LLM_CONFIG.repetitionPenalty,
          doSample: input.doSample,
        },
        { signal: input.signal },
      );
    },
  };
}
