<p align="center">
  <img src="public/atlas-logo.jpg" alt="Atlas" width="180">
</p>

<h1 align="center">Atlas</h1>

<p align="center">
  A privacy-first autonomous research agent that runs in the browser.<br>
  Ask a question, attach any text PDF, and get a direct answer.
</p>

<p align="center">
  <a href="https://github.com/shahil5z/atlas"><img src="https://img.shields.io/badge/source-GitHub-111111" alt="Source"></a>
  <a href="https://atlas-research-ruby.vercel.app"><img src="https://img.shields.io/badge/website-atlas--research--ruby.vercel.app-111111" alt="Website"></a>
  <img src="https://img.shields.io/badge/runtime-browser-02050b" alt="Runs in the browser">
  <img src="https://img.shields.io/badge/account-none-02050b" alt="No account">
</p>

<p align="center">
  <b><a href="https://atlas-research-ruby.vercel.app">Open Atlas</a></b>
  &nbsp;|&nbsp;
  <a href="https://github.com/shahil5z/atlas">Source</a>
  &nbsp;|&nbsp;
  <a href="docs/privacy.md">Privacy</a>
</p>

---

## About

Atlas reads a question, keeps the evidence that answers it, and writes a short reply. With a PDF attached, the answer comes from that file. Without one, the answer is labeled as the local model’s general knowledge.

There is no account and no database. When the server has an OpenAI key, Atlas sends the question and the extracted text to OpenAI and shows that reply. The key stays on the server. If OpenAI is missing, expired, or unavailable, Atlas answers with the local model instead. Vercel serves the website. The browser still downloads the local model weights for that fallback.

## Features

**Research**
- Understands the question, then answers it in the first sentence
- Drops text that does not answer the question, including instructions buried inside a PDF
- Headings and short bullets for document overviews
- A direct sentence when the question asks for one fact

**Documents**
- Any text-based PDF: reports, papers, resumes, invoices, checklists, study plans, and plain notes
- Page numbers kept with the extracted text
- Password-protected files are refused
- Scanned pages are detected and are not guessed at. Atlas does not run OCR

**Local models**
- Answers with SmolLM2-360M-Instruct
- Embeddings with all-MiniLM-L6-v2
- WebGPU when the browser has it, otherwise WASM

## Privacy

The PDF file stays in the browser tab. Atlas does not write the question or the file to `localStorage`, `sessionStorage`, IndexedDB, or cookies. Refreshing or closing the page clears the research.

With OpenAI configured, the question and the extracted page text are sent to OpenAI to write the answer. The API key is a server environment variable. It is not in the repository and not in the browser. If that request fails, nothing is sent and the local model answers from the tab.

The first local run downloads model weights from Hugging Face. That download is the model, not your file.

Details are in [docs/privacy.md](docs/privacy.md).

## Security

- Document text is untrusted. A line such as “ignore previous instructions” is content, not a command
- Tool arguments are checked before they run. Unknown tools are rejected
- Model output is parsed with Zod. Citations that were not retrieved are removed
- Answers are rendered as text, not HTML
- The site sends `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and a locked-down `Permissions-Policy`
- The OpenAI key is a server variable. The `env` file and `.env*` files stay out of git

Uploaded PDFs and `.env` files are gitignored. Do not commit them.

## How a question is answered

```
Question
  -> understand what is being asked
  -> if a PDF is attached, read its text and keep the parts that answer the question
  -> write a direct, short reply
  -> drop anything that does not belong
```

Overview questions are answered from the document’s own sections. A narrower question is answered from the sentences that match it. If the local model has to write and cannot cite a real passage, Atlas quotes only the matching sentences.

Limits, all in one place:

| Limit | Value |
|---|---|
| PDF size | 10 MB |
| PDF pages | 80 |
| Extracted text | 320,000 characters |
| Indexed chunks | 400 |
| Retrieved passages | top 5 |

A file under 10 MB is still refused when it is too long to process reliably in the browser.

## Technology

| Area | Details |
|---|---|
| App | Next.js, React, TypeScript |
| PDF | PDF.js, in the browser. JavaScript inside the PDF is not executed |
| Retrieval | Local embeddings, in-memory hybrid search (0.8 semantic, 0.2 lexical) |
| Agents | Planner, researcher, analyst, critic, synthesizer. One local model, capped loop |
| Checks | Zod schemas, citation validation, fixture evaluation |
| Hosting | Vercel serves the site. Research runs in the visitor’s browser |

## Local development

```bash
npm install
npm run dev
```

`npm install` copies the PDF.js worker into `public/pdf.worker.min.mjs`. That file is generated and gitignored.

```bash
npm run typecheck
npm run lint
npm run test
npm run eval
npm run build
```

The local path needs no environment variables. `OPENAI_API_KEY` is optional and is read only on the server. `OPENAI_MODEL` overrides the default model (`gpt-4.1-mini`).

## Deployment

The production site is [atlas-research-ruby.vercel.app](https://atlas-research-ruby.vercel.app).

1. Import this repository into Vercel.
2. Framework preset: Next.js.
3. Add `OPENAI_API_KEY` in the project environment if you want OpenAI answers. Do not commit the key.
4. Deploy. Without the key, Atlas uses the local model.

## Project structure

```
src/app/            Routes, error pages, global styles
src/components/     Header, composer, answer
src/features/       Client session
src/lib/agents/     Orchestrator, prompts, citation check
src/lib/documents/  Reading any text PDF and shaping the answer
src/lib/embeddings/ Local vectors and the in-memory index
src/lib/llm/        Local generation
docs/               Architecture, privacy, evaluation, licenses
```

## Author

Designed and developed by **Shohrab Haque Shahil**

[GitHub](https://github.com/shahil5z) | [LinkedIn](https://www.linkedin.com/in/shohrab-haque) | [Website](https://shahil-personal.vercel.app)

## License

Model and library licenses are listed in [docs/licenses.md](docs/licenses.md).
