/**
 * Читаемый отчёт Stage 9. Цифры только из runOptimizer, без подстановки.
 */
import { buildStage9Report } from "../src/lib/optimizer/benchmarks/runner.ts";
import { loadProductionCatalog } from "../src/lib/optimizer/load-catalog.ts";

function pad(value: string | number, width: number): string {
  const text = String(value);
  return text.length >= width ? text : `${" ".repeat(width - text.length)}${text}`;
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

const catalog = loadProductionCatalog();
const started = Date.now();
const report = buildStage9Report(catalog);

console.log("=== Stage 9 Search Quality ===");
console.log(`elapsed ${Date.now() - started}ms\n`);

for (const entry of report) {
  console.log(`Case ${entry.caseId} — ${entry.name}`);
  console.log(entry.description);
  console.log("");
  console.log("Algorithm              Score   Stars   Complete   Time    States");
  console.log("---------------------------------------------------------------");
  const rows = [
    entry.greedy,
    ...entry.widths.map((width) => ({
      label: `Beam(${width.beamWidth})`,
      score: width.score,
      stars: width.activatedStars,
      complete: width.complete,
      durationMs: width.durationMs,
      statesGenerated: width.statesGenerated,
    })),
    entry.greedyPlusLocal,
    entry.beamPlusLocal,
    entry.dfs,
  ].filter((row): row is NonNullable<typeof row> => Boolean(row));

  for (const row of rows) {
    console.log(
      `${pad(row.label, 22)} ${pad(row.score, 6)} ${pad(row.stars, 7)} ${pad(yesNo(row.complete), 10)} ${pad(`${row.durationMs}ms`, 7)} ${pad(row.statesGenerated, 8)}`,
    );
  }

  if (entry.dfs) {
    console.log(
      `DFS exhaustive=${entry.dfs.exhaustive}${entry.dfs.gap === undefined ? "" : ` gap=${entry.dfs.gap}`}`,
    );
  }

  console.log("");
  console.log("Local Search (Beam 1 → LS, resultCount=10)");
  console.log(
    `  initial ${entry.localSearch.initialScore} → final ${entry.localSearch.finalScore} (delta ${entry.localSearch.delta})`,
  );
  console.log(
    `  improvements=${entry.localSearch.improvements} iterations=${entry.localSearch.iterations} neighbors=${entry.localSearch.neighbors} time=${entry.localSearch.durationMs}ms complete=${entry.localSearch.complete}`,
  );

  console.log("Top-N scores without LS:", entry.topN.withoutLocal.join(", "));
  console.log("Top-N scores with LS:   ", entry.topN.withLocal.join(", "));

  console.log(
    `Dynamic ordering: static ${entry.dynamicOrdering.staticScore}/${entry.dynamicOrdering.staticDurationMs}ms  dynamic ${entry.dynamicOrdering.dynamicScore}/${entry.dynamicOrdering.dynamicDurationMs}ms`,
  );
  console.log("");
}
