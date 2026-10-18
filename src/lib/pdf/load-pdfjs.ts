import { PDF_WORKER_PATH } from "@/config/documents";

type PdfjsModule = typeof import("pdfjs-dist");

/**
 * PDF.js's legacy build is the one we ship.
 * It runs in current browsers and in Node, and it survives bundling more
 * reliably than the modern build. The matching worker is copied to
 * `public/pdf.worker.min.mjs` during install and loaded from this origin.
 *
 * This function is only called from browser document preparation, and from
 * Node tests. It must not run during server rendering.
 */
export async function loadPdfjs(): Promise<PdfjsModule> {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as PdfjsModule;

  if (typeof window !== "undefined" && pdfjs.GlobalWorkerOptions.workerSrc !== PDF_WORKER_PATH) {
    pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_PATH;
  }

  return pdfjs;
}
