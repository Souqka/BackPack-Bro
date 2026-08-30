/**
 * Читаемый отчёт Stage 16. Цифры только из runAdaptiveOptimizer.
 *
 * Incremental scoring ускоряет только unique cache misses.
 */
import { buildStage14Report } from "../src/lib/optimizer/benchmarks/runner.ts";
import { loadProductionCatalog } from "../src/lib/optimizer/load-catalog.ts";

function pad(value: string | number, width: number): string {
  const text = String(value);
  return text.length >= width ? text : `${" ".repeat(width - text.length)}${text}`;
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function shortId(caseId: string): string {
  return caseId.split("-")[0] ?? caseId;
}

const catalog = loadProductionCatalog();
const started = Date.now();
const report = buildStage14Report(catalog);

console.log("=== Stage 16 Incremental Placement Scoring ===");
console.log(`elapsed ${Date.now() - started}ms`);
console.log("");
console.log("incremental scoring ускоряет только unique cache misses");
console.log("");

console.log(
  "Case | Score same | Signature same | Cache misses | Incremental success | Fallback | Baseline ms | Incremental ms",
);
console.log(
  "----------------------------------------------------------------------------------------------------------------",
);

for (const entry of report) {
  console.log(
    `${pad(shortId(entry.caseId), 4)} ${pad(yesNo(entry.scoreSame), 10)} ${pad(yesNo(entry.signatureSame), 14)} ${pad(entry.incremental.scoreCacheMisses, 12)} ${pad(entry.incremental.incrementalSuccesses, 20)} ${pad(entry.incremental.incrementalFallbacks, 8)} ${pad(`${entry.cacheOnly.durationMs}ms`, 11)} ${pad(`${entry.incremental.durationMs}ms`, 15)}`,
  );
}

console.log("");
for (const entry of report) {
  const replaced = entry.incremental.incrementalSuccesses;
  const misses = entry.incremental.scoreCacheMisses;
  const replacedPct = misses === 0 ? "0.0%" : `${((replaced / misses) * 100).toFixed(1)}%`;
  console.log(`Case ${entry.caseId} — ${entry.name}`);
  console.log(entry.description);
  console.log(
    `  identity: score=${yesNo(entry.scoreSame)} stars=${yesNo(entry.starsSame)} complete=${yesNo(entry.completeSame)} coverage=${yesNo(entry.coverageSame)} placed=${yesNo(entry.placedSame)} signature=${yesNo(entry.signatureSame)} Top-N=${yesNo(entry.topNSame)} stop=${yesNo(entry.stopReasonSame)}`,
  );
  console.log(
    `  full:         score=${entry.full.score} stars=${entry.full.stars} complete=${entry.full.complete} ${entry.full.durationMs}ms evals=${entry.full.scoreEvaluations} misses=${entry.full.scoreCacheMisses}`,
  );
  console.log(
    `  cache-only:   score=${entry.cacheOnly.score} stars=${entry.cacheOnly.stars} complete=${entry.cacheOnly.complete} ${entry.cacheOnly.durationMs}ms evals=${entry.cacheOnly.scoreEvaluations} hits=${entry.cacheOnly.scoreCacheHits} misses=${entry.cacheOnly.scoreCacheMisses}`,
  );
  console.log(
    `  incremental:  score=${entry.incremental.score} stars=${entry.incremental.stars} complete=${entry.incremental.complete} ${entry.incremental.durationMs}ms evals=${entry.incremental.scoreEvaluations} hits=${entry.incremental.scoreCacheHits} misses=${entry.incremental.scoreCacheMisses}`,
  );
  console.log(
    `  incremental metrics: attempts=${entry.incremental.incrementalAttempts} success=${entry.incremental.incrementalSuccesses} fallback=${entry.incremental.incrementalFallbacks} affectedItems=${entry.incremental.incrementalAffectedItems} affectedInteractions=${entry.incremental.incrementalAffectedInteractions} affectedStars=${entry.incremental.incrementalAffectedStars}`,
  );
  console.log(`  unique misses replaced by incremental: ${replaced} / ${misses} (${replacedPct})`);
  console.log(`  stop: ${entry.incremental.stopReason}`);
  console.log("");
}
