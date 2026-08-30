/**
 * Читаемый отчёт Stage 15 — Search Quality / Benchmark Suite.
 * Цифры только из buildStage15Report(), без ручных подстановок.
 */
import { buildStage15Report } from "../src/lib/optimizer/benchmarks/suites/quality-suite.ts";
import { loadProductionCatalog } from "../src/lib/optimizer/load-catalog.ts";
import type {
  CaseQualitySummary,
  QualityComparison,
  SearchQualitySnapshot,
  Stage15QualityReport,
} from "../src/lib/optimizer/benchmarks/quality-types.ts";

function pad(value: string | number, width: number): string {
  const text = String(value);
  return text.length >= width ? text : `${" ".repeat(width - text.length)}${text}`;
}

function fmtScore(value: number): string {
  if (value === Number.NEGATIVE_INFINITY) return "-inf";
  if (!Number.isFinite(value)) return "n/a";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function fmtGap(gap: QualityComparison | null): string {
  if (!gap) return "n/a";
  return `${gap.relation} scoreΔ=${fmtScore(gap.scoreGap)} starΔ=${gap.starGap} completeΔ=${gap.completeGap}`;
}

function yesNo(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return "n/a";
  return value ? "yes" : "no";
}

function snapshot(
  report: Stage15QualityReport,
  caseId: string,
  algorithmId: string,
): SearchQualitySnapshot | undefined {
  return report.snapshots.find((row) => row.caseId === caseId && row.algorithmId === algorithmId)?.snapshot;
}

const mode = process.argv.includes("--full") ? "full" : "quick";
const catalog = loadProductionCatalog();
const report = buildStage15Report(catalog, mode);

console.log("=== Stage 15 Search Quality / Benchmark Suite ===");
console.log(`mode ${report.mode}  elapsed ${Math.round(report.elapsedMs)}ms  cases ${report.cases.length}\n`);

printSuiteOverview(report);
printCoverage(report);
printBestKnown(report);
printAlgorithmMatrix(report);
printBeamCurves(report);
printLocalSearch(report);
printAdaptive(report);
printHeuristic(report);
printPerformance(report);
printConclusions(report);

function printSuiteOverview(data: Stage15QualityReport): void {
  console.log("1. Suite overview");
  console.log(
    "   Algorithms: Greedy, Beam(1/2/5/10/20[/50/100]), Adaptive, DFS (feasible), Item/Joint LS (relevant).",
  );
  console.log("   Ranking: production complete → score → stars → coverage → placed → signature.");
  console.log("   Best known ≠ global optimum unless exhaustive DFS finished.");
  console.log(
    `   Width-sensitive cases: ${data.cases.filter((row) => row.categories.includes("beam_width_sensitive")).map((row) => row.caseId).join(", ") || "none"}`,
  );
  console.log(
    `   DFS-feasible cases: ${data.cases.filter((row) => row.categories.includes("dfs_feasible")).map((row) => row.caseId).join(", ") || "none"}`,
  );
  console.log("");
}

function printCoverage(data: Stage15QualityReport): void {
  console.log("2. Coverage matrix");
  console.log(`${pad("case", 22)} ${pad("categories", 62)} purpose`);
  for (const entry of data.coverage) {
    console.log(`${pad(entry.caseId, 22)} ${pad(entry.categories.join(","), 62)} ${entry.purpose}`);
  }
  console.log("");
}

function printBestKnown(data: Stage15QualityReport): void {
  console.log("3. Best-known results");
  console.log(
    `${pad("case", 22)} ${pad("score", 6)} ${pad("stars", 5)} ${pad("cplt", 4)} ${pad("proven", 6)} ${pad("source", 22)} sat`,
  );
  for (const entry of data.cases) {
    const bk = entry.bestKnown;
    console.log(
      `${pad(entry.caseId, 22)} ${pad(fmtScore(bk.score), 6)} ${pad(bk.activatedStars, 5)} ${pad(yesNo(bk.complete), 4)} ${pad(yesNo(bk.optimumProven), 6)} ${pad(bk.sourceLabel, 22)} ${entry.saturationWidth ?? "none"}`,
    );
  }
  console.log("");
}

function printAlgorithmMatrix(data: Stage15QualityReport): void {
  console.log("4. Algorithm comparison");
  for (const entry of data.cases) {
    console.log(
      `   ${entry.caseId}  best=${entry.bestKnown.sourceLabel} score=${fmtScore(entry.bestKnown.score)} proven=${yesNo(entry.bestKnown.optimumProven)}`,
    );
    console.log(`      Greedy    ${fmtGap(entry.greedyGap)}`);
    console.log(`      Beam(1)   ${fmtGap(entry.beam1Gap)}`);
    console.log(`      Beam(20)  ${fmtGap(entry.beam20Gap)}`);
    console.log(`      Adaptive  ${fmtGap(entry.adaptiveGap)}`);
    const ids = [
      "greedy",
      "beam:1",
      "beam:20",
      "adaptive",
      "dfs:exhaustive",
      "dfs:bounded",
      "beam:1+item_ls",
      "beam:1+joint_ls",
    ];
    const cells = ids
      .map((id) => snapshot(data, entry.caseId, id))
      .filter((row): row is SearchQualitySnapshot => Boolean(row))
      .map(
        (row) =>
          `${row.label} ${fmtScore(row.score)}/${row.activatedStars}/${yesNo(row.complete)}/${Math.round(row.durationMs)}ms`,
      );
    if (cells.length > 0) console.log(`      ${cells.join(" | ")}`);
  }
  console.log("");
}

function printBeamCurves(data: Stage15QualityReport): void {
  console.log("5. Beam width curves");
  for (const curve of data.beamCurves) {
    if (curve.points.length === 0) continue;
    const sensitive = data.cases
      .find((row) => row.caseId === curve.caseId)
      ?.categories.includes("beam_width_sensitive");
    console.log(
      `   ${curve.caseId}  saturation=${curve.saturationWidth ?? "none"}  width-sensitive=${yesNo(sensitive)}`,
    );
    console.log(
      `      ${curve.points.map((point) => `w${point.width}:${fmtScore(point.score)}/${point.stars}/${yesNo(point.complete)}/${Math.round(point.durationMs)}ms`).join("  ")}`,
    );
  }
  console.log("");
}

function printLocalSearch(data: Stage15QualityReport): void {
  console.log("6. Local Search effectiveness");
  if (data.localSearch.length === 0) {
    console.log("   (no LS-relevant cases in this mode)\n");
    return;
  }
  for (const row of data.localSearch) {
    console.log(
      `   ${row.caseId} seed=${fmtScore(row.seedScore)}/${yesNo(row.seedComplete)}  ItemLS=${yesNo(row.itemStrictImprovement)} (${fmtGap(row.itemDelta)})  JointLS=${yesNo(row.jointStrictImprovement)} (${fmtGap(row.jointDelta)})`,
    );
    console.log(
      `      Item  score=${fmtScore(row.afterItemLs.score)} moves=${row.afterItemLs.localSearch?.acceptedMoves ?? 0} neighbors=${row.afterItemLs.localSearch?.neighbors ?? 0} ${Math.round(row.afterItemLs.durationMs)}ms`,
    );
    console.log(
      `      Joint score=${fmtScore(row.afterJointLs.score)} accepted=${row.afterJointLs.localSearch?.acceptedMoves ?? 0} neighbors=${row.afterJointLs.localSearch?.neighbors ?? 0} ${Math.round(row.afterJointLs.durationMs)}ms`,
    );
  }
  console.log("");
}

function printAdaptive(data: Stage15QualityReport): void {
  console.log("7. Adaptive effectiveness");
  for (const row of data.adaptive) {
    console.log(
      `   ${row.caseId} matchBest=${yesNo(row.matchesBestKnown)} vsBeam1=${row.vsBeam1.relation} vsBeam20=${row.vsBeam20?.relation ?? "n/a"} bestFixed=Beam(${row.bestFixedBeamWidth ?? "?"}) stop=${row.stopReason} esc=${row.escalation} t/B20=${fmtRatio(row.runtimeRatioVsBeam20)} states/B20=${fmtRatio(row.statesRatioVsBeam20)} overhead=${yesNo(row.overheadOnly)}`,
    );
  }
  console.log("");
}

function printHeuristic(data: Stage15QualityReport): void {
  console.log("8. Heuristic diagnostics (depth-aware)");
  if (data.heuristic.length === 0) {
    console.log("   (no DFS samples)\n");
    return;
  }
  for (const row of data.heuristic) {
    console.log(
      `   ${row.caseId} samples=${row.sampleCount} sameDepthInv=${fmtRate(row.sameDepthInversionRate)} (${row.sameDepthInversionCount}/${row.sameDepthPairCount}) allDepthInv=${fmtRate(row.inversionRate)} exhaustive=${yesNo(row.dfsExhaustive)} dfsScore=${fmtScore(row.dfsScore)}`,
    );
  }
  console.log("");
}

function printPerformance(data: Stage15QualityReport): void {
  console.log("9. Performance summary");
  const byAlgo = new Map<string, { n: number; ms: number; states: number }>();
  for (const row of data.snapshots) {
    const key = row.snapshot.source;
    const acc = byAlgo.get(key) ?? { n: 0, ms: 0, states: 0 };
    acc.n += 1;
    acc.ms += row.snapshot.durationMs;
    acc.states += row.snapshot.cost.statesGenerated;
    byAlgo.set(key, acc);
  }
  for (const [key, acc] of byAlgo) {
    console.log(
      `   ${pad(key, 24)} runs=${pad(acc.n, 3)}  avg ${pad(Math.round(acc.ms / acc.n), 5)}ms  avg states ${Math.round(acc.states / acc.n)}`,
    );
  }
  const slowest = [...data.snapshots].sort((a, b) => b.snapshot.durationMs - a.snapshot.durationMs).slice(0, 8);
  console.log("   slowest runs:");
  for (const row of slowest) {
    console.log(
      `      ${row.caseId} ${row.snapshot.label} ${Math.round(row.snapshot.durationMs)}ms states=${row.snapshot.cost.statesGenerated}`,
    );
  }
  console.log("");
}

function printConclusions(data: Stage15QualityReport): void {
  console.log("10. Final conclusions");
  const beamLoses = data.cases.filter((row) => row.beam20Gap && row.beam20Gap.relation === "worse");
  const beam1Loses = data.cases.filter((row) => row.beam1Gap && row.beam1Gap.relation === "worse");
  console.log(`   Beam(20) loses to best known: ${formatCases(beamLoses)}`);
  console.log(`   Beam(1) loses to best known: ${formatCases(beam1Loses)}`);

  const saturations = data.beamCurves
    .map((curve) => curve.saturationWidth)
    .filter((width): width is number => width !== null)
    .sort((a, b) => a - b);
  console.log(
    `   Saturation widths: ${saturations.length === 0 ? "none reached" : saturations.join(", ")} (median ${median(saturations) ?? "n/a"})`,
  );

  const lsHelps = data.localSearch.filter((row) => row.itemStrictImprovement || row.jointStrictImprovement);
  console.log(`   LS strict improvement: ${lsHelps.map((row) => row.caseId).join(", ") || "none"}`);

  const adaptiveHelps = data.adaptive.filter((row) => row.improvedOverBeam1);
  const adaptiveOverhead = data.adaptive.filter((row) => row.overheadOnly);
  const adaptiveMatch = data.adaptive.filter((row) => row.matchesBestKnown);
  console.log(`   Adaptive improves Beam(1): ${adaptiveHelps.map((row) => row.caseId).join(", ") || "none"}`);
  console.log(`   Adaptive matches best known: ${adaptiveMatch.map((row) => row.caseId).join(", ") || "none"}`);
  console.log(`   Adaptive overhead-only: ${adaptiveOverhead.map((row) => row.caseId).join(", ") || "none"}`);
  const earlyStopMiss = data.adaptive.filter(
    (row) => !row.matchesBestKnown && (row.stopReason === "stable_result" || row.stopReason === "complete_layout"),
  );
  console.log(
    `   Adaptive early-stop before best known: ${earlyStopMiss.map((row) => `${row.caseId}/${row.stopReason}`).join(", ") || "none"}`,
  );

  const proven = data.cases.filter((row) => row.bestKnown.optimumProven);
  console.log(
    `   Proven optima: ${proven.map((row) => `${row.caseId}@${fmtScore(row.bestKnown.score)}`).join(", ") || "none"}`,
  );

  const inversions = data.heuristic.filter((row) => row.sameDepthInversionRate > 0);
  console.log(
    `   Heuristic same-depth inversions: ${
      inversions.length === 0
        ? "none sampled"
        : inversions.map((row) => `${row.caseId}=${fmtRate(row.sameDepthInversionRate)}`).join(", ")
    }`,
  );
  console.log("   Heuristic weights were not changed. Findings are measurements only.");
  console.log("");
}

function formatCases(rows: CaseQualitySummary[]): string {
  if (rows.length === 0) return "none";
  return rows.map((row) => row.caseId).join(", ");
}

function fmtRatio(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return value.toFixed(2);
}

function fmtRate(value: number): string {
  if (!Number.isFinite(value)) return "n/a";
  return `${(value * 100).toFixed(1)}%`;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[mid - 1]! + values[mid]!) / 2 : values[mid]!;
}
