# Privacy

Atlas keeps a research session in the browser tab. Closing or refreshing the page clears it.

## Stays in memory

- The question
- The PDF file and its extracted text
- Chunks and embedding vectors
- Retrieval results
- The answer, citations, and research trace

These are not written to localStorage, sessionStorage, IndexedDB, cookies, the address bar, or an application database. There is no account and no research API.

## What can use the network

The app shell is loaded from wherever Atlas is hosted. The first research run can download model weights and the ONNX runtime. Those requests go to the model host (Hugging Face) and the runtime CDN. The browser may cache those weights. That cache is for model files, not for the PDF or the question.

The PDF file is not stored on the server. When `OPENAI_API_KEY` is set, the question and extracted page text are sent to OpenAI to write the answer. The key is read only on the server. If OpenAI declines the request, Atlas falls back to the local model and does not retry the upload. Atlas does not search the web.

## What Atlas does not claim

“Nothing ever leaves this device” is not a claim Atlas makes. A hosted copy of the app is downloaded, model files can be downloaded, and a configured OpenAI answer sends the question and extracted text to OpenAI. The local fallback keeps that research in the tab.

## Documents Atlas will not invent

Scanned and image-only pages are detected. They are not visually interpreted. OCR is not included. A PDF that is too large for the browser limits is rejected instead of partially indexed.
