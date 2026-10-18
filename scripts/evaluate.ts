import { formatReport, runAtlasEvaluation } from "../src/lib/evaluation/suite";

const requested = process.argv.slice(2);
const known = ["retrieval", "citations", "agents", "structured"] as const;
const sections =
  requested.length === 0 || requested.includes("all")
    ? known
    : known.filter((name) => requested.includes(name));

if (sections.length === 0) {
  console.error("Usage: npm run eval -- [retrieval|citations|agents|structured|all]");
  process.exitCode = 1;
} else {
  const evaluation = await runAtlasEvaluation(sections);
  for (const report of evaluation.reports) {
    console.log(formatReport(report));
    console.log("");
  }
  const failures = evaluation.reports.reduce((sum, report) => sum + report.failures.length, 0);
  if (failures > 0) process.exitCode = 1;
}
