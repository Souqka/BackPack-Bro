/**
 * Читаемый отчёт Stage 13. Цифры только из runAdaptiveOptimizer.
 */
import { buildStage13Report } from "../src/lib/optimizer/benchmarks/runner.ts";
import { loadProductionCatalog } from "../src/lib/optimizer/load-catalog.ts";

function pad(value: string | number, width: number): string {
  const text = String(value);
  return text.length >= width ? text : `${" ".repeat(width - text.length)}${text}`;
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function shortId(caseId: string): string {
  return caseId.split("-")[0] ?? caseId;
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

const catalog = loadProductionCatalog();
const started = Date.now();
const report = buildStage13Report(catalog);

console.log("=== Stage 13 Transposition Pruning ===");
console.log(`elapsed ${Date.now() - started}ms\n`);

console.log(
  "Case | score same | signature same | baseline | pruned | states gen | accepted | t-pruned | evals | hit rate",
);
console.log(
  "-----------------------------------------------------------------------------------------------------------",
);

for (const entry of report) {
  console.log(
    `${pad(shortId(entry.caseId), 4)} ${pad(yesNo(entry.scoreSame), 10)} ${pad(yesNo(entry.signatureSame), 14)} ${pad(`${entry.baseline.durationMs}ms`, 10)} ${pad(`${entry.pruned.durationMs}ms`, 10)} ${pad(entry.pruned.statesGenerated, 10)} ${pad(entry.pruned.transpositionAccepted, 8)} ${pad(entry.pruned.transpositionPruned, 8)} ${pad(entry.pruned.scoreEvaluations, 6)} ${pct(entry.pruned.hitRate)}`,
  );
}

console.log("");
for (const entry of report) {
  console.log(`Case ${entry.caseId} — ${entry.name}`);
  console.log(entry.description);
  console.log(`  score: ${entry.scoreSame ? "same" : "DIFFERENT"} (${entry.baseline.score} → ${entry.pruned.score})`);
  console.log(`  signature: ${entry.signatureSame ? "same" : "DIFFERENT"} Top-N: ${entry.topNSame ? "same" : "DIFFERENT"} stop: ${entry.stopReasonSame ? "same" : "DIFFERENT"} (${entry.pruned.stopReason})`);
  console.log(
    `  baseline: ${entry.baseline.durationMs}ms states=${entry.baseline.statesGenerated} evals=${entry.baseline.scoreEvaluations} unique=${entry.baseline.scoreCacheMisses}`,
  );
  console.log(
    `  pruned:   ${entry.pruned.durationMs}ms states=${entry.pruned.statesGenerated} accepted=${entry.pruned.transpositionAccepted} t-pruned=${entry.pruned.transpositionPruned} replacements=${entry.pruned.transpositionReplacements} evals=${entry.pruned.scoreEvaluations} unique=${entry.pruned.scoreCacheMisses} hitRate=${pct(entry.pruned.hitRate)}`,
  );
  console.log("");
}
