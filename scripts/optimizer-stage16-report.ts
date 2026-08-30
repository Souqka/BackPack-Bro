/**
 * Stage 16 decision report: pipeline profiling + cache-only vs incremental.
 * Цифры только из buildStage16Report(). Scoring Engine не меняется.
 */
import { buildStage16Report } from "../src/lib/optimizer/benchmarks/suites/stage16.ts";
import type { PipelineSummary } from "../src/lib/optimizer/benchmarks/incremental-decision.ts";
import { uniqueScoringMs } from "../src/lib/optimizer/search-profile.ts";
import { loadProductionCatalog } from "../src/lib/optimizer/load-catalog.ts";

function pad(value: string | number, width: number): string {
  const text = String(value);
  return text.length >= width ? text : `${" ".repeat(width - text.length)}${text}`;
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function pct(part: number, total: number): string {
  if (total <= 0) return "n/a";
  return `${((part / total) * 100).toFixed(1)}%`;
}

function shortId(caseId: string): string {
  return caseId.split("-")[0] ?? caseId;
}

function decisionFromSummary(summary: PipelineSummary): {
  decision: "IMPLEMENTED" | "NOT_IMPLEMENTED";
  why: string[];
} {
  const buckets = [
    { name: "unique scoring", share: summary.uniqueScoringShare },
    { name: "candidate generation", share: summary.candidateGenerationShare },
    { name: "search residual", share: summary.residualShare },
  ].sort((a, b) => b.share - a.share);
  const top = buckets[0]!;
  const why = [
    `Largest exclusive bucket: ${top.name} (${(top.share * 100).toFixed(1)}%).`,
    `Unique scoring median case share: ${(summary.medianUniqueShare * 100).toFixed(1)}%.`,
    `Incremental successes / cache misses: ${summary.successes}/${summary.misses} (${(summary.replacedMissShare * 100).toFixed(1)}%).`,
    `Fallbacks: ${summary.fallbacks}; attempts === successes+fallbacks: ${summary.attempts === summary.successes + summary.fallbacks ? "yes" : "no"}.`,
  ];
  if (summary.wallClockDeltaMs !== null) {
    why.push(
      `cache-only − incremental wall-clock (sum over G–O): ${summary.wallClockDeltaMs.toFixed(0)}ms; faster=${summary.fasterCaseIds.join(",") || "none"}; slower=${summary.slowerCaseIds.join(",") || "none"}.`,
    );
  }

  const uniqueIsLargest = top.name === "unique scoring";
  const wallClockWin = (summary.wallClockDeltaMs ?? 0) > 0 && summary.slowerCaseIds.length === 0;
  if (uniqueIsLargest && wallClockWin) {
    why.push("Gate: unique scoring is the largest bucket and incremental is faster — IMPLEMENTED.");
    return { decision: "IMPLEMENTED", why };
  }
  why.push(
    "Gate: unique scoring is not the remaining bottleneck and/or incremental does not improve wall-clock. No new incremental engine. NOT_IMPLEMENTED.",
  );
  return { decision: "NOT_IMPLEMENTED", why };
}

const catalog = loadProductionCatalog();
const report = buildStage16Report(catalog);
const gate = decisionFromSummary(report.summary);

console.log("=== Stage 16 Incremental Scoring (Decision-Gated) ===");
console.log(`elapsed ${Math.round(report.elapsedMs)}ms  cases ${report.cases.length}`);
console.log("");

console.log("1. Suite overview");
console.log("   Production-like Adaptive on G–O. analyzePlacementScore stays source of truth.");
console.log("   Exclusive: candidate generation, unique scoring (full + incremental compute).");
console.log("   Inclusive Adaptive metrics (LS / Joint / Repair) overlap those leaves — not added into the same %.");
console.log("");

console.log("2. Pipeline profiling (exclusive leaf times, Adaptive default = cache + incremental)");
console.log(
  `${pad("case", 6)} ${pad("total", 8)} ${pad("cand%", 7)} ${pad("uniq%", 7)} ${pad("full ms", 8)} ${pad("incr ms", 8)} ${pad("hits", 6)} ${pad("misses", 7)} ${pad("succ", 6)} ${pad("fb", 4)} ${pad("heur", 6)}`,
);
for (const entry of report.cases) {
  const p = entry.pipeline;
  const uniq = uniqueScoringMs(p.profile);
  console.log(
    `${pad(shortId(entry.caseId), 6)} ${pad(`${Math.round(p.totalMs)}ms`, 8)} ${pad(pct(p.profile.candidateGeneration.durationMs, p.totalMs), 7)} ${pad(pct(uniq, p.totalMs), 7)} ${pad(p.profile.fullScoring.durationMs.toFixed(0), 8)} ${pad(p.profile.incrementalScoring.durationMs.toFixed(0), 8)} ${pad(p.profile.scoreCacheHits.count, 6)} ${pad(p.profile.scoreCacheMisses.count, 7)} ${pad(p.incrementalSuccesses, 6)} ${pad(p.incrementalFallbacks, 4)} ${pad(p.profile.heuristicCalls, 6)}`,
  );
}
console.log("");
console.log(
  `   totals: unique scoring ${pct(report.summary.uniqueScoringMs, report.summary.totalMs)}  candidates ${pct(report.summary.candidateGenerationMs, report.summary.totalMs)}  cache-hit lookup ${pct(report.summary.cacheHitMs, report.summary.totalMs)}  residual ${pct(report.summary.residualShare * report.summary.totalMs, report.summary.totalMs)}`,
);
console.log("");

console.log("3. Decision gate");
console.log(`   shouldImplementIncrementalScoring: ${gate.decision}`);
for (const line of gate.why) console.log(`   - ${line}`);
console.log("");

console.log("4. cache-only vs cache+incremental (identity + wall-clock)");
console.log(
  `${pad("case", 6)} ${pad("same", 6)} ${pad("misses", 7)} ${pad("succ", 6)} ${pad("fb", 4)} ${pad("cache", 10)} ${pad("incr", 10)}`,
);
for (const entry of report.cases) {
  const same =
    entry.scoreSame &&
    entry.signatureSame &&
    entry.completeSame &&
    entry.coverageSame &&
    entry.placedSame &&
    entry.stopReasonSame &&
    entry.topNSame;
  console.log(
    `${pad(shortId(entry.caseId), 6)} ${pad(yesNo(same), 6)} ${pad(entry.incremental.misses, 7)} ${pad(entry.incremental.incrementalSuccesses, 6)} ${pad(entry.incremental.incrementalFallbacks, 4)} ${pad(`${entry.cacheOnly.durationMs.toFixed(0)}ms`, 10)} ${pad(`${entry.incremental.durationMs.toFixed(0)}ms`, 10)}`,
  );
}
console.log("");

for (const entry of report.cases) {
  console.log(`Case ${entry.caseId} — ${entry.name}`);
  console.log(
    `  identity: score=${yesNo(entry.scoreSame)} stars=${yesNo(entry.starsSame)} complete=${yesNo(entry.completeSame)} coverage=${yesNo(entry.coverageSame)} placed=${yesNo(entry.placedSame)} signature=${yesNo(entry.signatureSame)} Top-N=${yesNo(entry.topNSame)} stop=${yesNo(entry.stopReasonSame)}`,
  );
  console.log(
    `  cache-only:  ${entry.cacheOnly.score}/${entry.cacheOnly.stars}/${yesNo(entry.cacheOnly.complete)} ${entry.cacheOnly.durationMs.toFixed(0)}ms evals=${entry.cacheOnly.evaluations} hits=${entry.cacheOnly.hits} misses=${entry.cacheOnly.misses}`,
  );
  console.log(
    `  incremental: ${entry.incremental.score}/${entry.incremental.stars}/${yesNo(entry.incremental.complete)} ${entry.incremental.durationMs.toFixed(0)}ms evals=${entry.incremental.evaluations} hits=${entry.incremental.hits} misses=${entry.incremental.misses} attempts=${entry.incremental.incrementalAttempts} success=${entry.incremental.incrementalSuccesses} fallback=${entry.incremental.incrementalFallbacks}`,
  );
  console.log(
    `  pipeline: cand=${entry.pipeline.profile.candidateGeneration.durationMs.toFixed(0)}ms uniq=${uniqueScoringMs(entry.pipeline.profile).toFixed(0)}ms full=${entry.pipeline.profile.fullScoring.durationMs.toFixed(0)}ms incr=${entry.pipeline.profile.incrementalScoring.durationMs.toFixed(0)}ms LS=${entry.pipeline.localSearchMs}ms joint=${entry.pipeline.jointMs}ms repair=${entry.pipeline.repairMs}ms stop=${entry.incremental.stopReason}`,
  );
  console.log("");
}

console.log("5. Existing incremental path (not expanded this stage)");
console.log("   Moves: item_place/remove/relocate/rotate/swap, repair, bag_relocate/rotate/swap (bag-only reuses score).");
console.log("   Cache: lookup → hit return → miss → incremental if context → fallback analyzePlacementScore → store.");
console.log("   Integration: Item LS, Joint Bag LS, Repair. Beam/Greedy/DFS have no predecessor context.");
console.log("");
