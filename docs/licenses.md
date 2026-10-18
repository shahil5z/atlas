# Licenses and attribution

Atlas application code in this repository is the project author's work. Third-party libraries and models are not.

## Models

| Asset | Source | License | Role |
| --- | --- | --- | --- |
| `Xenova/all-MiniLM-L6-v2` | Hugging Face, Transformers.js export of sentence-transformers/all-MiniLM-L6-v2 | Apache-2.0 | Local embeddings |
| `onnx-community/SmolLM2-360M-Instruct-ONNX` | Hugging Face ONNX build of HuggingFaceTB SmolLM2-360M-Instruct | Apache-2.0 | Local answers |

Weights download in the browser from Hugging Face on first use. They are not committed to this repository. Atlas does not claim authorship of either model.

## Libraries

| Package | Role | License |
| --- | --- | --- |
| Next.js, React | Application shell | MIT |
| Tailwind CSS | Styling | MIT |
| `pdfjs-dist` | Local PDF text extraction | Apache-2.0 |
| `@huggingface/transformers` | In-browser ONNX runtime for embeddings and generation | Apache-2.0 |
| Zod | Schema checks for agent outputs and tools | MIT |
| Vitest | Tests and the evaluation command host | MIT |

Confirm the exact license text in each package or model card before a public release. This table is a pointer, not a replacement for those notices.
