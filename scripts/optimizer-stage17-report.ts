/**
 * Stage 17 production API report.
 * Figures come only from buildStage17Report() — no hand-filled scores.
 */
import { buildStage17Report } from "../src/lib/optimizer/benchmarks/suites/stage17.ts";
import { loadProductionCatalog } from "../src/lib/optimizer/load-catalog.ts";

function pad(value: string | number, width: number): string {
  const text = String(value);
  return text.length >= width ? text : `${" ".repeat(width - text.length)}${text}`;
}

function fmtScore(value: number | null): string {
  if (value === null) return "null";
  if (!Number.isFinite(value)) return "n/a";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

const catalog = loadProductionCatalog();
const report = buildStage17Report(catalog);

console.log("=== Stage 17 Production Optimizer API ===");
console.log(`elapsed ${Math.round(report.elapsedMs)}ms  rows ${report.rows.length}`);
console.log("");
console.log("Production boundary over Adaptive Search. No new search algorithm.");
console.log("Presets: fast / balanced (default) / high. resultCount=3 for Top-N visibility.");
console.log("");
console.log(
  `${pad("case", 22)} ${pad("preset", 10)} ${pad("score", 8)} ${pad("stars", 6)} ${pad("complete", 8)} ${pad("duration", 10)} ${pad("stop", 24)} ${pad("n", 4)}`,
);

for (const row of report.rows) {
  if (!row.ok) {
    console.log(
      `${pad(row.caseId, 22)} ${pad(row.preset, 10)} ERROR ${row.errorCode} ${row.message}`,
    );
    continue;
  }
  console.log(
    `${pad(row.caseId, 22)} ${pad(row.preset, 10)} ${pad(fmtScore(row.score), 8)} ${pad(row.stars, 6)} ${pad(row.complete ? "yes" : "no", 8)} ${pad(`${row.durationMs}ms`, 10)} ${pad(row.stopReason, 24)} ${pad(row.resultCount, 4)}`,
  );
}

console.log("");
console.log("Cases: A simple; G width-sensitive; J bag topology; E unplaced; H multi-bag.");
