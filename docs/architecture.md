# Atlas architecture

Atlas is a Next.js application whose research work happens in the browser. Vercel serves the shell. It does not receive PDFs, questions, or embedding vectors.

## Document lifecycle

A selected PDF stays a `File` in React state. PDF.js, running against a same-origin worker, extracts text per page. The chunker does not cross page boundaries. Chunk ids include the document id, page, order, and character span.

Removing the file clears the in-memory index. A new question can keep the same PDF and reuse that index. Refreshing or closing the page drops React state and disposes both the embedding engine and the language model.

## Embedding lifecycle

The embedding engine is a separate interface from retrieval: `initialize`, `embed`, `embedBatch`, `dispose`. The worker owns Transformers.js. The UI talks to an embedding client with typed messages: initialize, embed, progress, embeddings, error, dispose.

The model loads only when a document research run starts. WebGPU is preferred. WASM is the fallback. Model files may be cached by the browser. That cache holds weights, not user documents. `useFSCache` is off. User vectors are not stored in IndexedDB.

## Retrieval pipeline

```
question
  -> display query and a whitespace-normalized retrieval query
  -> query embedding
  -> cosine search
  -> BM25 on the same chunks, scaled to the max score
  -> 0.8 semantic + 0.2 lexical
  -> score-order reranker
  -> optional MMR, off by default
  -> top-k hits with page citations
  -> bounded context for a future generator
```

The index keeps vectors and ids. Passage text is read back from the chunk list when the UI or the context builder needs it. Indexes of at most 2,000 chunks are scored in full. Larger indexes take a semantic candidate pool first, then the lexical score is applied to that pool.

## Generation

The language model is a second worker. Agents call `LanguageModel`, which calls `LocalLlmEngine`, which talks to that worker. Transformers.js stays inside the worker.

```
user
  -> planner
  -> retriever
  -> analyst
  -> critic
  -> synthesizer
  -> answer and citations
```

The answer model is SmolLM2-360M-Instruct. WebGPU loads q4f16 first. A one-word readiness check follows. If that reply is not usable, Atlas tries q4 on WebGPU, then q4 on WASM. Each prompt is split into system instructions, the user question, `<document_evidence>`, and the task. Document text is untrusted. The orchestrator stops on sufficient evidence, the iteration cap, cancellation, or a hard failure. Overview, summary, and extraction questions are answered from the document profile and page structure before the local model is asked to write. A model draft is kept only when citation validation matches a retrieved passage. Otherwise Atlas quotes the retrieved passages. Tool calls are JSON requests executed by the app after schema checks.

## Agent graph

The same roles are an internal graph (`atlas-research` v1): planner to researcher to analyst to critic, then either another retrieval when evidence is insufficient or synthesis when it is enough or the iteration cap is hit. Specialists share one local model. The graph is not a visual editor and the roles are not separate servers.

Traces are built from those events in the tab. They are not sent anywhere.

## Privacy

No database, account, analytics endpoint, or research persistence. Questions, PDFs, extracted text, embeddings, answers, citations, and traces stay in tab memory. Refresh or close clears them. Model weights may remain in the browser cache. The expected network is the app itself plus model and runtime assets from Hugging Face and the ONNX runtime CDN. Atlas does not claim that nothing leaves the browser. A PDF is rejected above 10 MB, above 80 pages, above 320,000 extracted characters, or above 400 chunks, with the message that it is too large to process reliably in the browser.

## Evaluation

`npm run eval` scores versioned fixtures: retrieval-v1, citations-v1, structured-v1, agents-v1, and documents-v1. Metrics are computed in process. The provisional baseline is a floor for those fixtures, not a live-model accuracy claim. See `docs/evaluation.md` and `docs/privacy.md`.

## Deployment hardening

Production error boundaries, security headers, the 400-chunk cap, and the privacy source scan are in the tree. There is still no remote model and no stored research history. Vercel can host the Next.js app; inference stays in the browser.
