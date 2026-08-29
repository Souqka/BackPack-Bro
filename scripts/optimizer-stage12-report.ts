/**
 * Читаемый отчёт Stage 12. Цифры только из runAdaptiveOptimizer.
 */
import { buildStage12Report } from "../src/lib/optimizer/benchmarks/runner.ts";
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
const report = buildStage12Report(catalog);

console.log("=== Stage 12 Score Cache ===");
console.log(`elapsed ${Date.now() - started}ms\n`);

console.log("Case | score same | signature same | uncached | cached | evals | hits | misses | hit rate");
console.log("-----------------------------------------------------------------------------------------");

for (const entry of report) {
  const uncached = `${entry.uncached.durationMs}ms`;
  const cached = `${entry.cached.durationMs}ms`;
  console.log(
    `${pad(shortId(entry.caseId), 4)} ${pad(yesNo(entry.scoreSame), 10)} ${pad(yesNo(entry.signatureSame), 14)} ${pad(uncached, 10)} ${pad(cached, 10)} ${pad(entry.cached.evaluations, 6)} ${pad(entry.cached.hits, 6)} ${pad(entry.cached.misses, 6)} ${pct(entry.cached.hitRate)}`,
  );
}

console.log("");
for (const entry of report) {
  console.log(`Case ${entry.caseId} — ${entry.name}`);
  console.log(entry.description);
  console.log(
    `  score: ${entry.scoreSame ? "same" : "DIFFERENT"} (${entry.uncached.score} → ${entry.cached.score})`,
  );
  console.log(
    `  stars: ${entry.starsSame ? "same" : "DIFFERENT"} complete: ${entry.completeSame ? "same" : "DIFFERENT"} (${yesNo(entry.cached.complete)})`,
  );
  console.log(`  signature: ${entry.signatureSame ? "same" : "DIFFERENT"}`);
  console.log(`  Top-N: ${entry.topNSame ? "same" : "DIFFERENT"} stop: ${entry.stopReasonSame ? "same" : "DIFFERENT"} (${entry.cached.stopReason})`);
  console.log(`  uncached: ${entry.uncached.durationMs}ms evals=${entry.uncached.evaluations} unique=${entry.uncached.uniqueLayouts}`);
  console.log(
    `  cached:   ${entry.cached.durationMs}ms evals=${entry.cached.evaluations} hits=${entry.cached.hits} misses=${entry.cached.misses} unique=${entry.cached.uniqueLayouts} hitRate=${pct(entry.cached.hitRate)}`,
  );
  console.log("");
}
