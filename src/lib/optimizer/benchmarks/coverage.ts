/**
 * Coverage matrix Stage 15: зачем существует каждый quality case.
 *
 * Метаданные живут здесь, а не в production optimizer. Сами A–O
 * остаются прежними наборами Bags/Items.
 */

import type { Item } from "../../inventory/types.ts";
import {
  OPTIMIZER_BENCHMARK_CASES,
  STAGE9_BENCHMARK_CASES,
  STAGE10_BENCHMARK_CASES,
  STAGE11_BENCHMARK_CASES,
  STAGE15_EXTRA_CASES,
  getBenchmarkCase,
} from "./cases.ts";
import type { BenchmarkCategory, QualityBenchmarkCase } from "./quality-types.ts";

interface CaseMeta {
  categories: BenchmarkCategory[];
  purpose: string;
}

const QUALITY_CASE_META: Record<string, CaseMeta> = {
  "A-simple": {
    categories: ["control", "dfs_feasible"],
    purpose: "Маленький полный layout: DFS-oracle, контроль детерминизма и greedy=beam.",
  },
  "B-star-synergy": {
    categories: ["star_topology_sensitive", "dfs_feasible"],
    purpose: "Bar+Ore+Starbloom: поиск должен найти Star overlap, а не просто упаковать клетки.",
  },
  "C-complex-geometry": {
    categories: ["dense_geometry"],
    purpose: "L-shape и асимметричная Star: чувствительность к rotation/якорям, не к ширине Bags.",
  },
  "D-many-positions": {
    categories: ["beam_width_sensitive", "dense_geometry"],
    purpose: "Много мелких якорей в Bottom Trawl: Beam width влияет на отсечение выгодных веток.",
  },
  "E-tight-space": {
    categories: ["incomplete", "dfs_feasible"],
    purpose: "Feasible, но complete невозможен: алгоритм обязан вернуть unplaced без exception.",
  },
  "F-two-bags": {
    categories: ["multi_bag", "bag_topology_sensitive"],
    purpose: "Две Bags меняют availableCells: Greedy проигрывает Beam из-за Bag layout.",
  },
  "G-competing-stars": {
    categories: ["star_topology_sensitive", "beam_width_sensitive", "local_search_sensitive", "multi_bag"],
    purpose: "Два Bar+Starbloom: узкий Beam блокирует взаимные Star, широкий сохраняет ветку.",
  },
  "H-multiple-bags": {
    categories: ["multi_bag", "bag_topology_sensitive", "beam_width_sensitive"],
    purpose: "Три Fanny Pack: смежность площади под Bar+Starbloom зависит от Bag topology.",
  },
  "I-geometry-trap": {
    categories: ["dense_geometry", "beam_width_sensitive", "local_search_sensitive"],
    purpose: "Ранний поворот L-shape перекрывает выгодную Star-конфигурацию.",
  },
  "J-bag-item-topology": {
    categories: ["bag_topology_sensitive", "multi_bag", "dfs_feasible", "beam_width_sensitive"],
    purpose: "Те же Items, что B, но две Bags: оптимум зависит от формы availableCells.",
  },
  "K-displaced-repair": {
    categories: ["repair_sensitive", "local_search_sensitive", "multi_bag", "bag_topology_sensitive"],
    purpose: "Смена Bag topology displaces Items: repair должен восстановить placement.",
  },
  "L-multistart": {
    categories: ["bag_topology_sensitive", "multi_bag"],
    purpose: "Один лучший Bag seed не обязан дать лучший Item layout — нужен второй seed.",
  },
  "M-stable-stop": {
    categories: ["control"],
    purpose: "Beam(1) уже complete: Adaptive не должен эскалировать budget впустую.",
  },
  "N-escalation": {
    categories: ["beam_width_sensitive", "star_topology_sensitive", "multi_bag"],
    purpose: "Как G: Adaptive должен эскалировать, если Beam(1) слабее широкого Beam.",
  },
  "O-multi-bag-repair": {
    categories: ["multi_bag", "repair_sensitive", "local_search_sensitive", "bag_topology_sensitive"],
    purpose: "Три разные Bags: Joint/repair сдвигает topology и чинит displaced Items.",
  },
  "P-asymmetric-star": {
    categories: ["star_topology_sensitive", "dense_geometry"],
    purpose: "Асимметричная Star gift box vs Bar Star: competing overlap на реальной геометрии.",
  },
  "Q-impossible-l": {
    categories: ["incomplete", "dfs_feasible"],
    purpose: "L-shape физически не влезает в Fanny Pack: complete невозможен, DFS-feasible.",
  },
};

const WIDTH_SENSITIVE_IDS = new Set(
  Object.entries(QUALITY_CASE_META)
    .filter(([, meta]) => meta.categories.includes("beam_width_sensitive"))
    .map(([id]) => id),
);

const DFS_FEASIBLE_IDS = new Set(
  Object.entries(QUALITY_CASE_META)
    .filter(([, meta]) => meta.categories.includes("dfs_feasible"))
    .map(([id]) => id),
);

const LOCAL_SEARCH_IDS = new Set(
  Object.entries(QUALITY_CASE_META)
    .filter(
      ([, meta]) =>
        meta.categories.includes("local_search_sensitive") || meta.categories.includes("repair_sensitive"),
    )
    .map(([id]) => id),
);

const TINY_IDS = new Set(["A-simple", "E-tight-space", "M-stable-stop", "Q-impossible-l"]);

export function uniqueQualityCases(): QualityBenchmarkCase[] {
  const byId = new Map<string, ReturnType<typeof getBenchmarkCase>>();
  for (const entry of [
    ...OPTIMIZER_BENCHMARK_CASES,
    ...STAGE9_BENCHMARK_CASES,
    ...STAGE10_BENCHMARK_CASES,
    ...STAGE11_BENCHMARK_CASES,
    ...STAGE15_EXTRA_CASES,
  ]) {
    if (!byId.has(entry.id)) byId.set(entry.id, entry);
  }
  return [...byId.values()].map(attachQualityMeta);
}

export function attachQualityMeta(
  entry: ReturnType<typeof getBenchmarkCase>,
): QualityBenchmarkCase {
  const meta = QUALITY_CASE_META[entry.id];
  if (!meta) {
    throw new Error(`Benchmark case ${entry.id} не имеет quality category metadata`);
  }
  return { ...entry, categories: meta.categories, purpose: meta.purpose };
}

export function assertProductionCatalogCoverage(
  cases: ReadonlyArray<{ id: string; bags: { itemId: string }[]; items: { itemId: string }[] }>,
  catalog: Map<string, Item>,
): void {
  const missing: string[] = [];
  for (const entry of cases) {
    for (const bag of entry.bags) {
      if (!catalog.has(bag.itemId)) missing.push(`${entry.id}: bag ${bag.itemId}`);
    }
    for (const item of entry.items) {
      if (!catalog.has(item.itemId)) missing.push(`${entry.id}: item ${item.itemId}`);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Отсутствующие production itemId:\n${missing.join("\n")}`);
  }
}

export function isWidthSensitive(caseId: string): boolean {
  return WIDTH_SENSITIVE_IDS.has(caseId);
}

export function isDfsFeasible(caseId: string): boolean {
  return DFS_FEASIBLE_IDS.has(caseId);
}

export function isLocalSearchCase(caseId: string): boolean {
  return LOCAL_SEARCH_IDS.has(caseId);
}

export function isTinyCase(caseId: string): boolean {
  return TINY_IDS.has(caseId);
}

export function beamWidthsForCase(caseId: string, mode: "quick" | "full"): number[] {
  const base = [1, 2, 5, 10, 20];
  if (mode === "full" || isWidthSensitive(caseId)) base.push(50);
  if (mode === "full" || isTinyCase(caseId) || caseId === "B-star-synergy") {
    if (isTinyCase(caseId) || caseId === "B-star-synergy") base.push(100);
  }
  return [...new Set(base)].sort((a, b) => a - b);
}

export { QUALITY_CASE_META };
