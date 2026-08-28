/**
 * Реальные benchmark cases на production itemId.
 *
 * Предметы и Bags взяты из data/normalized/items.json.
 * Игровые числа и механики не выдумываются.
 */

import { DEFAULT_BACKPACK } from "../types.ts";
import type { OptimizerBenchmarkCase } from "./types.ts";

const GRID = { rows: DEFAULT_BACKPACK.rows, cols: DEFAULT_BACKPACK.cols };

export const OPTIMIZER_BENCHMARK_CASES: OptimizerBenchmarkCase[] = [
  {
    id: "A-simple",
    name: "Маленький простой",
    inventory: GRID,
    bags: [{ instanceId: "bag", itemId: "medium_bag" }],
    items: [
      { instanceId: "ore-1", itemId: "adamantite_ore" },
      { instanceId: "ore-2", itemId: "adamantite_ore" },
    ],
    options: { bagBeamWidth: 8, itemBeamWidth: 10 },
    description: "Две Ore в Medium Bag (4 клетки). Базовый поиск и сравнение beam width.",
    runDfs: true,
  },
  {
    id: "B-star-synergy",
    name: "Star synergy",
    inventory: GRID,
    bags: [{ instanceId: "bag", itemId: "warrior_backpack" }],
    items: [
      { instanceId: "bar", itemId: "adamantite_bar" },
      { instanceId: "ore", itemId: "adamantite_ore" },
      { instanceId: "bloom", itemId: "starbloom" },
    ],
    options: { bagBeamWidth: 8, itemBeamWidth: 20, dfs: { maxNodes: 30_000, maxDepth: 8, timeoutMs: 8_000 } },
    description:
      "Adamantite Bar + Ore + Starbloom: placement → Star overlap → activation → score.",
    runDfs: true,
  },
  {
    id: "C-complex-geometry",
    name: "Сложная геометрия",
    inventory: GRID,
    bags: [{ instanceId: "bag", itemId: "bottom_trawl" }],
    items: [
      { instanceId: "cat", itemId: "black_cat" },
      { instanceId: "box", itemId: "big_chocolate_gift_box" },
      { instanceId: "ore", itemId: "adamantite_ore" },
    ],
    options: { bagBeamWidth: 10, itemBeamWidth: 20 },
    description:
      "L-shape (black_cat, 4 rotation), асимметричная Star (big_chocolate_gift_box), 1-клеточная Ore.",
  },
  {
    id: "D-many-positions",
    name: "Много возможных позиций",
    inventory: GRID,
    bags: [{ instanceId: "bag", itemId: "bottom_trawl" }],
    items: [
      { instanceId: "ore-1", itemId: "adamantite_ore" },
      { instanceId: "ore-2", itemId: "adamantite_ore" },
      { instanceId: "ore-3", itemId: "adamantite_ore" },
      { instanceId: "bar", itemId: "adamantite_bar" },
      { instanceId: "bloom", itemId: "starbloom" },
    ],
    options: { bagBeamWidth: 8, itemBeamWidth: 20 },
    description: "Bottom Trawl (9 клеток) и несколько мелких Items — pruning и beam width.",
  },
  {
    id: "E-tight-space",
    name: "Ограниченное пространство",
    inventory: GRID,
    bags: [{ instanceId: "bag", itemId: "fanny_pack" }],
    items: [
      { instanceId: "ore-1", itemId: "adamantite_ore" },
      { instanceId: "ore-2", itemId: "adamantite_ore" },
      { instanceId: "bar", itemId: "adamantite_bar" },
    ],
    options: { bagBeamWidth: 6, itemBeamWidth: 8, dfs: { maxNodes: 8_000, maxDepth: 6, timeoutMs: 3_000 } },
    description: "Fanny Pack (2 клетки) vs 1+1+2 клеток Items: feasible, unplacedItems, без exception.",
    runDfs: true,
  },
  {
    id: "F-two-bags",
    name: "Несколько Bags",
    inventory: GRID,
    bags: [
      { instanceId: "bag-a", itemId: "medium_bag" },
      { instanceId: "bag-b", itemId: "fanny_pack" },
    ],
    items: [
      { instanceId: "bar", itemId: "adamantite_bar" },
      { instanceId: "ore", itemId: "adamantite_ore" },
      { instanceId: "bloom", itemId: "starbloom" },
    ],
    options: { bagBeamWidth: 12, itemBeamWidth: 20 },
    description: "Две Bags → разные availableCells → Item search. Layout Bags влияет на Items.",
  },
];

export const STAGE9_BENCHMARK_CASES: OptimizerBenchmarkCase[] = [
  {
    id: "G-competing-stars",
    name: "Competing Stars",
    inventory: GRID,
    bags: [
      { instanceId: "bag-a", itemId: "warrior_backpack" },
      { instanceId: "bag-b", itemId: "medium_bag" },
    ],
    items: [
      { instanceId: "bar-1", itemId: "adamantite_bar" },
      { instanceId: "bar-2", itemId: "adamantite_bar" },
      { instanceId: "bloom-1", itemId: "starbloom" },
      { instanceId: "bloom-2", itemId: "starbloom" },
    ],
    bagIds: ["warrior_backpack", "medium_bag"],
    itemIds: ["adamantite_bar", "adamantite_bar", "starbloom", "starbloom"],
    expected: { minScore: 2, minActiveStars: 2 },
    options: { bagBeamWidth: 50, itemBeamWidth: 50 },
    description:
      "Два Bar и два Starbloom: ранний placement блокирует взаимные Star. Широкий Beam сохраняет ветку с большим числом активаций.",
  },
  {
    id: "H-multiple-bags",
    name: "Multiple Bags",
    inventory: GRID,
    bags: [
      { instanceId: "bag-a", itemId: "fanny_pack" },
      { instanceId: "bag-b", itemId: "fanny_pack" },
      { instanceId: "bag-c", itemId: "fanny_pack" },
    ],
    items: [
      { instanceId: "bar", itemId: "adamantite_bar" },
      { instanceId: "ore", itemId: "adamantite_ore" },
      { instanceId: "bloom", itemId: "starbloom" },
    ],
    bagIds: ["fanny_pack", "fanny_pack", "fanny_pack"],
    itemIds: ["adamantite_bar", "adamantite_ore", "starbloom"],
    expected: { minScore: 1, minActiveStars: 1 },
    options: { bagBeamWidth: 50, itemBeamWidth: 50 },
    description:
      "Три Fanny Pack: Bag layout A может не собрать смежную площадь под Bar+Starbloom, layout B даёт больше Star activation.",
  },
  {
    id: "I-geometry-trap",
    name: "Geometry trap",
    inventory: GRID,
    bags: [{ instanceId: "bag", itemId: "bottom_trawl" }],
    items: [
      { instanceId: "cat", itemId: "black_cat" },
      { instanceId: "bar", itemId: "adamantite_bar" },
      { instanceId: "ore", itemId: "adamantite_ore" },
      { instanceId: "bloom", itemId: "starbloom" },
    ],
    bagIds: ["bottom_trawl"],
    itemIds: ["black_cat", "adamantite_bar", "adamantite_ore", "starbloom"],
    expected: { minScore: 2, minActiveStars: 2 },
    options: { bagBeamWidth: 8, itemBeamWidth: 50 },
    description:
      "L-shape black_cat + Bar со Star вне cells. Ранний поворот кошки перекрывает выгодную Star-конфигурацию.",
  },
  {
    id: "J-bag-item-topology",
    name: "Bag + Item topology",
    inventory: GRID,
    bags: [
      { instanceId: "bag-a", itemId: "medium_bag" },
      { instanceId: "bag-b", itemId: "fanny_pack" },
    ],
    items: [
      { instanceId: "bar", itemId: "adamantite_bar" },
      { instanceId: "ore", itemId: "adamantite_ore" },
      { instanceId: "bloom", itemId: "starbloom" },
    ],
    bagIds: ["medium_bag", "fanny_pack"],
    itemIds: ["adamantite_bar", "adamantite_ore", "starbloom"],
    expected: { minScore: 2, minActiveStars: 2 },
    options: { bagBeamWidth: 50, itemBeamWidth: 50, dfs: { maxNodes: 25_000, maxDepth: 8, timeoutMs: 8_000 } },
    description:
      "Те же Items, что в B, но две Bags вместо одной прямоугольной. Оптимум зависит от формы availableCells, не только от Item search.",
    runDfs: true,
  },
];

export const STAGE10_BENCHMARK_CASES: OptimizerBenchmarkCase[] = [
  STAGE9_BENCHMARK_CASES.find((entry) => entry.id === "H-multiple-bags")!,
  STAGE9_BENCHMARK_CASES.find((entry) => entry.id === "I-geometry-trap")!,
  STAGE9_BENCHMARK_CASES.find((entry) => entry.id === "J-bag-item-topology")!,
  {
    id: "K-displaced-repair",
    name: "Bag topology displaces Items",
    inventory: GRID,
    bags: [
      { instanceId: "bag-a", itemId: "medium_bag" },
      { instanceId: "bag-b", itemId: "medium_bag" },
    ],
    items: [
      { instanceId: "bar", itemId: "adamantite_bar" },
      { instanceId: "ore-1", itemId: "adamantite_ore" },
      { instanceId: "ore-2", itemId: "adamantite_ore" },
      { instanceId: "bloom", itemId: "starbloom" },
    ],
    bagIds: ["medium_bag", "medium_bag"],
    itemIds: ["adamantite_bar", "adamantite_ore", "adamantite_ore", "starbloom"],
    expected: { minScore: 1, minActiveStars: 1 },
    options: { bagBeamWidth: 20, itemBeamWidth: 20 },
    description:
      "Две Medium Bag: смена topology меняет availableCells. Items, которые больше не лежат в новой области, должны быть displaced и repair-иться.",
  },
];

export const SMOKE_BENCHMARK_CASES: OptimizerBenchmarkCase[] = [
  {
    id: "smoke-5",
    name: "Smoke 5 Items",
    inventory: GRID,
    bags: [{ instanceId: "bag", itemId: "bottom_trawl" }],
    items: [
      { instanceId: "i1", itemId: "adamantite_ore" },
      { instanceId: "i2", itemId: "adamantite_bar" },
      { instanceId: "i3", itemId: "starbloom" },
      { instanceId: "i4", itemId: "apple" },
      { instanceId: "i5", itemId: "cheese" },
    ],
    options: { bagBeamWidth: 8, itemBeamWidth: 12 },
    description: "5 реальных Items, не весь каталог.",
  },
  {
    id: "smoke-10",
    name: "Smoke 10 Items",
    inventory: GRID,
    bags: [
      { instanceId: "bag-a", itemId: "warrior_backpack" },
      { instanceId: "bag-b", itemId: "medium_bag" },
    ],
    items: [
      { instanceId: "i1", itemId: "adamantite_ore" },
      { instanceId: "i2", itemId: "adamantite_bar" },
      { instanceId: "i3", itemId: "starbloom" },
      { instanceId: "i4", itemId: "apple" },
      { instanceId: "i5", itemId: "cheese" },
      { instanceId: "i6", itemId: "amethyst" },
      { instanceId: "i7", itemId: "bolts" },
      { instanceId: "i8", itemId: "butter" },
      { instanceId: "i9", itemId: "cactus" },
      { instanceId: "i10", itemId: "diamond" },
    ],
    options: { bagBeamWidth: 8, itemBeamWidth: 10 },
    description: "10 реальных Items и две Bags.",
  },
  {
    id: "smoke-20",
    name: "Smoke 20 Items",
    inventory: GRID,
    bags: [
      { instanceId: "bag-a", itemId: "bottom_trawl" },
      { instanceId: "bag-b", itemId: "warrior_backpack" },
      { instanceId: "bag-c", itemId: "medium_bag" },
    ],
    items: [
      { instanceId: "i1", itemId: "adamantite_ore" },
      { instanceId: "i2", itemId: "adamantite_bar" },
      { instanceId: "i3", itemId: "starbloom" },
      { instanceId: "i4", itemId: "apple" },
      { instanceId: "i5", itemId: "cheese" },
      { instanceId: "i6", itemId: "amethyst" },
      { instanceId: "i7", itemId: "bolts" },
      { instanceId: "i8", itemId: "butter" },
      { instanceId: "i9", itemId: "cactus" },
      { instanceId: "i10", itemId: "diamond" },
      { instanceId: "i11", itemId: "clockwork" },
      { instanceId: "i12", itemId: "candy_corn" },
      { instanceId: "i13", itemId: "counterfeit_coin" },
      { instanceId: "i14", itemId: "crystal_shard" },
      { instanceId: "i15", itemId: "diamond_dust" },
      { instanceId: "i16", itemId: "bag_of_flour" },
      { instanceId: "i17", itemId: "ball_of_thread" },
      { instanceId: "i18", itemId: "barbed_spring" },
      { instanceId: "i19", itemId: "brimstone_powder" },
      { instanceId: "i20", itemId: "arcane_crystal" },
    ],
    options: { bagBeamWidth: 6, itemBeamWidth: 8, maxDurationMs: 15_000 },
    description: "20 реальных Items, три Bags. Цель: не падает, deterministic, valid layout.",
  },
];

export const BEAM_WIDTHS = [1, 5, 10, 20, 50, 100] as const;
export const STAGE9_BEAM_WIDTHS = [1, 2, 5, 10, 20, 50] as const;

export function getBenchmarkCase(id: string): OptimizerBenchmarkCase {
  const found = [
    ...OPTIMIZER_BENCHMARK_CASES,
    ...STAGE9_BENCHMARK_CASES,
    ...STAGE10_BENCHMARK_CASES,
    ...SMOKE_BENCHMARK_CASES,
  ].find((entry) => entry.id === id);
  if (!found) throw new Error(`Неизвестный benchmark case: ${id}`);
  return found;
}
