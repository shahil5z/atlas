import { MAX_PDF_SIZE_BYTES, PDF_SIGNATURE } from "@/config/documents";
import { atlasError } from "@/lib/errors/atlas-error";
import type { AtlasError } from "@/types/errors";

export type PdfValidationResult = { ok: true } | { ok: false; error: AtlasError };

export function pdfSizeError(size: number): AtlasError | null {
  if (!Number.isFinite(size) || size <= 0) return atlasError("invalid_file");
  if (size > MAX_PDF_SIZE_BYTES) return atlasError("file_too_large");
  return null;
}

function hasPdfSignature(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_SIGNATURE.length) return false;
  const signature = String.fromCharCode(...bytes.slice(0, PDF_SIGNATURE.length));
  return signature === PDF_SIGNATURE;
}

/**
 * Validates an untrusted file before PDF.js sees it.
 * The PDF signature is the authority; the MIME type is only a hint.
 * The file is not uploaded.
 */
export async function validatePdfFile(file: File): Promise<PdfValidationResult> {
  const sizeError = pdfSizeError(file.size);
  if (sizeError) return { ok: false, error: sizeError };

  let header: Uint8Array;
  try {
    header = new Uint8Array(await file.slice(0, PDF_SIGNATURE.length).arrayBuffer());
  } catch {
    return { ok: false, error: atlasError("invalid_file") };
  }

  if (!hasPdfSignature(header)) {
    return { ok: false, error: atlasError("invalid_file") };
  }

  return { ok: true };
}
