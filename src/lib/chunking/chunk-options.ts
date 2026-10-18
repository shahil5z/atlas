import {
  DEFAULT_CHUNK_OVERLAP,
  DEFAULT_CHUNK_SIZE,
  MAX_CHUNK_OVERLAP,
  MAX_CHUNK_SIZE,
  MIN_CHUNK_SIZE,
} from "@/config/chunking";
import { z } from "zod";

export interface ChunkDocumentOptions {
  chunkSize: number;
  overlap: number;
}

const chunkOptionsSchema = z.object({
  chunkSize: z.int().min(MIN_CHUNK_SIZE).max(MAX_CHUNK_SIZE),
  overlap: z.int().min(0).max(MAX_CHUNK_OVERLAP),
});

export function resolveChunkOptions(
  options?: Partial<ChunkDocumentOptions>,
): ChunkDocumentOptions {
  const parsed = chunkOptionsSchema.safeParse({
    chunkSize: options?.chunkSize ?? DEFAULT_CHUNK_SIZE,
    overlap: options?.overlap ?? DEFAULT_CHUNK_OVERLAP,
  });

  if (!parsed.success) {
    throw new Error("Chunk size or overlap is outside the supported range.");
  }

  if (parsed.data.overlap >= parsed.data.chunkSize) {
    throw new Error("Chunk overlap must be smaller than chunk size.");
  }

  return parsed.data;
}
