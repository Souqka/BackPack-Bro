/**
 * Читаемый отчёт Stage 10. Цифры только из runOptimizer, без подстановки.
 */
import { buildStage10Report } from "../src/lib/optimizer/benchmarks/runner.ts";
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
const report = buildStage10Report(catalog);

console.log("=== Stage 10 Joint Bag + Item Local Search ===");
console.log(`elapsed ${Date.now() - started}ms\n`);

for (const entry of report) {
  console.log(`Case ${entry.caseId} — ${entry.name}`);
  console.log(entry.description);
  console.log("");
  console.log("A. Stage 9 baseline / B. Joint Bag Search");
  console.log("Mode                      Score  Stars  Complete  Time     Placed");
  console.log("----------------------------------------------------------------");
  for (const row of [entry.beam1, entry.beam1ItemLs, entry.beam1Joint, entry.beam20]) {
    console.log(
      `${pad(row.label, 25)} ${pad(row.score, 5)} ${pad(row.stars, 6)} ${pad(yesNo(row.complete), 9)} ${pad(`${row.durationMs}ms`, 8)} ${pad(row.placedItems, 6)}`,
    );
  }

  const joint = entry.beam1Joint;
  console.log("");
  console.log("B. Joint scores");
  console.log(`  initial ${joint.initialScore} → final ${joint.finalScore} (delta ${joint.delta})`);
  console.log(`  iterations=${joint.bagLocalSearchIterations}`);

  console.log("");
  console.log("C. Bag operations");
  console.log(
    `  generated=${joint.bagNeighborsGenerated} visited=${joint.bagNeighborsVisited} pruned=${joint.bagNeighborsPruned} accepted=${joint.bagLayoutsAccepted}`,
  );

  console.log("");
  console.log("D. Repair");
  console.log(
    `  displaced=${joint.displacedItems} repaired=${joint.repairedItems} unrepaired=${joint.unrepairedItems}`,
  );
  console.log(`  repairStates generated=${joint.repairStatesGenerated} pruned=${joint.repairStatesPruned}`);

  console.log("");
  console.log("E. Runtime");
  console.log(
    `  total=${joint.durationMs}ms repair=${joint.repairDurationMs}ms itemLS=${joint.itemLocalSearchDurationMs}ms bagLS=${joint.bagLocalSearchDurationMs}ms`,
  );
  console.log("");
}
