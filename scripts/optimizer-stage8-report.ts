/**
 * Печать реального Stage 8 report в stdout.
 * Не подставляет цифры: только buildStage8Report().
 */
import { buildStage8Report } from "../src/lib/optimizer/benchmarks/runner.ts";
import { loadProductionCatalog } from "../src/lib/optimizer/load-catalog.ts";

const catalog = loadProductionCatalog();
const started = Date.now();
const report = buildStage8Report(catalog);
console.log(JSON.stringify({ elapsedMs: Date.now() - started, report }, null, 2));
