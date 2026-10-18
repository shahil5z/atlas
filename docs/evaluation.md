# Evaluation

Atlas measures the research pipeline with deterministic fixtures. The commands do not download a model, do not call a paid API, and do not read a user document.

## Philosophy

A small local model will miss JSON, invent a citation, or rank a passage poorly. Those failures should show up as a number and a case id, not as a feeling about a demo. The fixtures are synthetic. A high score here means the code behaved on the fixture. It does not mean the live model is accurate.

Datasets, prompts, and this evaluator are versioned (`retrieval-v1`, `citations-v1`, `structured-v1`, `agents-v1`, `documents-v1`, `eval-v1`). Changing a fixture without bumping the version makes old numbers incomparable. `documents-v1` checks semantic properties of document answers, not exact wording. These numbers are not a live browser score. Scanned-PDF behavior, Firefox, Safari, and Edge remain unverified unless a person runs them.

## How to run

```bash
npm run eval
npm run eval:retrieval
npm run eval:citations
npm run eval:agents
npm run eval:all
```

`eval` and `eval:all` run every section. The process exits with code 1 when a section reports a failure. `npm test` runs the same checks plus formula and security tests.

## Retrieval

Fixture: `evaluation/datasets/retrieval-v1.ts`. Two queries over six hand-built passages and vectors.

Variants, using the same ranker the app uses:

- `semantic`: cosine only
- `hybrid`: `0.8 * cosine + 0.2 * BM25` (the product default)
- `hybrid-mmr`: hybrid, then maximal marginal relevance

The score-order reranker sorts by the score it is given. On these fixtures it does not change hybrid order, so its Recall@5 delta can be zero. That is a result, not an assumption that reranking helps.

Formulas:

- Recall@K = relevant items in the top K / all relevant items
- Precision@K = relevant items in the top K / K
- MRR = mean of 1 / rank of the first relevant item
- nDCG@K = DCG@K / ideal DCG@K, with binary relevance and `log2(rank + 1)`

The report names the configured embedding model. The fixture does not load that model. Latency in the report is the in-process ranking time.

## Citations

Fixture: `evaluation/datasets/citations-v1.ts`.

The same `validateAnswerCitations` function used after synthesis scores each case.

- Citation validity = kept citations / (kept + removed). Empty citation lists that were not supposed to cite anything score 1.
- Invalid citation rate = removed / (kept + removed).
- Citation coverage = evidence-typed claims whose chunk id survived / evidence-typed claims. Inference claims are not counted as missing citations. The coverage value is null when a case has no evidence-typed claims.

Keep, reject, and uncited expectations are part of the fixture. A rejected fake id is a pass, not a quality failure. The reported citation validity near 0.5 is the mean of those cases: a kept citation scores 1, a fully rejected citation scores 0, and an intentionally uncited inference scores 1.

## Structured output

Fixture: `evaluation/datasets/structured-v1.ts`, checked with the analyst Zod schema.

- Success rate = parses that match the schema, including one deterministic trailing-comma repair. On the current seven-case fixture, three succeed, so the rate stays near 0.429. The invalid cases are intentional.
- Failure rate = parses that throw
- Repair rate = cases that needed that repair and then parsed
- Retry recovery = a scripted second attempt after a bad first reply

## Agents

Fixture behavior is scripted inside `src/lib/evaluation/agent-eval.ts`. The orchestrator is the real one. The model is not.

Scenarios: evidence sufficient immediately, critic asks for another retrieval, iteration cap, model failure, cancellation, and no document.

Reported rates:

- completion, termination, failure, cancellation
- average iterations and tool calls on completed runs
- whether the critic path emitted another retrieval

Termination rate counts a controlled failure and a cancellation as ended, not as success.

## Single pass and orchestration

`compareModes` is an evaluation-only comparison.

- Mode A generates once.
- Mode B runs planner, researcher, analyst, critic, and synthesizer.

Both sides then go through citation validation. On the current script, the single pass cites a chunk that was not retrieved and the orchestrated path cites `p2`. The report is that fixture result. It is not a claim that multi-agent orchestration is generally better, faster, or more accurate.

## Regression

`evaluation/baselines/provisional.ts` holds floors measured on these fixtures. They are marked provisional because they are not live-model benchmarks. If Recall@5 or the structured success rate drops below the floor, evaluation fails.

## Failures

Each failure has a case id, category, expected value, actual value, and severity. Categories include retrieval, citation, structured output, agent, performance, and security. Prompt-injection and tool-rejection checks live in the unit tests: hostile document text stays inside `<document_evidence>`, and unknown tools, extra fields, and oversized queries are rejected before a tool runs.

## What is not measured

Live SmolLM2 quality, human preference, and semantic entailment. A citation can be a real retrieved chunk and still be a weak answer. Coverage does not prove the passage entails the claim.
