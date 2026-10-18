import { copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const workerPath = require.resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "public", "pdf.worker.min.mjs");

copyFileSync(workerPath, target);
