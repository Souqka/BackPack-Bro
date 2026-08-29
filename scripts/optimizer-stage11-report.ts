/**
 * Читаемый отчёт Stage 11. Цифры только из runOptimizer / runAdaptiveOptimizer.
 */
import { buildStage11Report } from "../src/lib/optimizer/benchmarks/runner.ts";
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
const report = buildStage11Report(catalog);

console.log("=== Stage 11 Adaptive Search Portfolio ===");
console.log(`elapsed ${Date.now() - started}ms\n`);

console.log("Case | Beam(1) | Beam(20) | Joint | Adaptive   (score / stars / complete / time)");
console.log("--------------------------------------------------------------------------------");

for (const entry of report) {
  const row = (mode: typeof entry.beam1) =>
    `${mode.score}/${mode.stars}/${yesNo(mode.complete)}/${mode.durationMs}ms`;
  console.log(
    `${pad(entry.caseId, 22)} ${pad(row(entry.beam1), 22)} ${pad(row(entry.beam20), 22)} ${pad(row(entry.joint), 22)} ${row(entry.adaptive)}`,
  );
}

console.log("");
for (const entry of report) {
  console.log(`Case ${entry.caseId} — ${entry.name}`);
  console.log(entry.description);
  console.log(
    `  Adaptive: seeds=${entry.adaptive.bagSeeds} escalation=${entry.adaptive.escalationSteps} states=${entry.adaptive.states} stop=${entry.adaptive.stopReason} duration=${entry.adaptive.durationMs}ms placed=${entry.adaptive.placed} unplaced=${entry.adaptive.unplaced}`,
  );
  const vs20 =
    entry.adaptive.score > entry.beam20.score
      ? "Adaptive > Beam(20)"
      : entry.adaptive.score === entry.beam20.score
        ? "Adaptive matched Beam(20)"
        : "Adaptive was lower than Beam(20)";
  const vs1 =
    entry.adaptive.score > entry.beam1.score || (entry.adaptive.complete && !entry.beam1.complete)
      ? "Adaptive improved over Beam(1)"
      : "Adaptive did not improve Beam(1)";
  console.log(`  ${vs20}; ${vs1}`);
  console.log("");
}
