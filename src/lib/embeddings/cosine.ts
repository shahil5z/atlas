import { atlasError } from "@/lib/errors/atlas-error";

export function cosineSimilarity(left: Float32Array, right: Float32Array): number {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    throw atlasError("dimension_mismatch");
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? Number.NaN;
    const b = right[index] ?? Number.NaN;
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw atlasError("invalid_vector");
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }

  if (leftNorm === 0 || rightNorm === 0) return 0;

  const similarity = dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
  if (!Number.isFinite(similarity)) return 0;
  return similarity;
}
