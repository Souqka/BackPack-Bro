/**
 * Stage 16 Phase A: pipeline share of Adaptive G–O.
 * Same measurements as the Stage 16 report profiling section.
 */
import { buildStage16Report } from "../src/lib/optimizer/benchmarks/suites/stage16.ts";
import { uniqueScoringMs } from "../src/lib/optimizer/search-profile.ts";
import { loadProductionCatalog } from "../src/lib/optimizer/load-catalog.ts";

function pad(value: string | number, width: number): string {
  const text = String(value);
  return text.length >= width ? text : `${" ".repeat(width - text.length)}${text}`;
}

function pct(part: number, total: number): string {
  if (total <= 0) return "n/a";
  return `${((part / total) * 100).toFixed(1)}%`;
}

const catalog = loadProductionCatalog();
const report = buildStage16Report(catalog);

console.log("=== Stage 16 profiling (Adaptive G–O) ===");
console.log(`elapsed ${Math.round(report.elapsedMs)}ms`);
console.log("");
console.log(
  `${pad("case", 22)} ${pad("total", 8)} ${pad("candidates", 12)} ${pad("unique score", 12)} ${pad("full", 8)} ${pad("incremental", 12)} ${pad("LS/joint/repair", 16)}`,
);
for (const entry of report.cases) {
  const p = entry.pipeline;
  const uniq = uniqueScoringMs(p.profile);
  console.log(
    `${pad(entry.caseId, 22)} ${pad(`${Math.round(p.totalMs)}ms`, 8)} ${pad(pct(p.profile.candidateGeneration.durationMs, p.totalMs), 12)} ${pad(pct(uniq, p.totalMs), 12)} ${pad(`${p.profile.fullScoring.durationMs.toFixed(0)}ms`, 8)} ${pad(`${p.profile.incrementalScoring.durationMs.toFixed(0)}ms`, 12)} ${pad(`${p.localSearchMs + p.jointMs + p.repairMs}ms`, 16)}`,
  );
}
console.log("");
console.log(
  `unique scoring share ${pct(report.summary.uniqueScoringMs, report.summary.totalMs)}  candidates ${pct(report.summary.candidateGenerationMs, report.summary.totalMs)}  residual ${pct(report.summary.residualShare * report.summary.totalMs, report.summary.totalMs)}`,
);
console.log(
  `incremental ${report.summary.successes} successes / ${report.summary.misses} misses  fallbacks ${report.summary.fallbacks}`,
);
