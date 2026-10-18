import { atlasError, isAtlasError, logDevelopmentError } from "@/lib/errors/atlas-error";
import type { AtlasError } from "@/types/errors";

function errorName(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("name" in error)) return null;
  const name = error.name;
  return typeof name === "string" ? name : null;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

/**
 * Maps unknown failures to a user-facing error.
 * Raw parser messages and stack traces stay in the development log.
 */
export function toAtlasError(error: unknown, context: string): AtlasError {
  if (isAtlasError(error)) return error;

  logDevelopmentError(error, context);

  const name = errorName(error);
  const text = errorText(error).toLowerCase();

  if (name === "PasswordException" || text.includes("password")) {
    return atlasError("password_protected");
  }

  if (text.includes("out of memory") || text.includes("oom") || text.includes("allocation failed")) {
    return atlasError("memory_exhausted");
  }

  if (context === "llm") {
    if (
      text.includes("failed to fetch") ||
      text.includes("network") ||
      text.includes("download") ||
      text.includes("could not locate file") ||
      text.includes("http")
    ) {
      return atlasError("llm_download_failed");
    }
    return atlasError("llm_init_failed");
  }

  if (context === "model" || context === "embed" || context === "retrieval") {
    if (
      text.includes("failed to fetch") ||
      text.includes("network") ||
      text.includes("download") ||
      text.includes("http")
    ) {
      return atlasError("model_download_failed");
    }
    if (context === "embed") return atlasError("embedding_failed");
    if (context === "retrieval") return atlasError("retrieval_failed");
    return atlasError("model_init_failed");
  }

  if (text.includes("worker") || name === "WorkerError") {
    return atlasError("worker_failed");
  }

  if (
    name === "InvalidPDFException" ||
    name === "MissingPDFException" ||
    name === "FormatError"
  ) {
    return atlasError("pdf_parse_failed");
  }

  return atlasError("unexpected");
}
