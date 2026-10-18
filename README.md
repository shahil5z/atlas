<p align="center">
  <img src="public/atlas-logo.jpg" alt="Atlas" width="180">
</p>

<h1 align="center">Atlas</h1>

<p align="center">
  Ask a question, attach a PDF if you have one, and get a short answer.
</p>

<p align="center">
  <a href="https://atlas-research-ruby.vercel.app"><b>Open Atlas</b></a>
</p>

## What it does

Atlas reads your question. If you attach a text PDF, it reads that file too. The answer starts with one direct sentence, then a few headings and short bullets.

OpenAI writes the answer when the server has a key. If the key is missing, expired, or the request fails, Atlas uses a small model in your browser instead.

It works with normal text PDFs: reports, notes, papers, resumes, and similar files. Password-protected files are turned away. Scanned pages have no text to read, and Atlas does not run OCR.

A PDF can be up to 10 MB and 80 pages.

## Privacy

The file stays in the browser tab. Nothing is saved in a database. Refresh or close the page and the session is gone.

For an OpenAI answer, the question and the extracted text are sent to OpenAI. The API key stays on the server. It is not in this repository.

More is in [docs/privacy.md](docs/privacy.md).

## Run it locally

```bash
npm install
npm run dev
```

The local fallback does not need a key. To use OpenAI, set `OPENAI_API_KEY` in the server environment. Do not commit that key.

The live site is [atlas-research-ruby.vercel.app](https://atlas-research-ruby.vercel.app).

## Author

Designed and developed by **Shohrab Haque Shahil**

[GitHub](https://github.com/shahil5z) · [LinkedIn](https://www.linkedin.com/in/shohrab-haque) · [Website](https://shahil-personal.vercel.app)

## License

Model and library licenses are in [docs/licenses.md](docs/licenses.md).
