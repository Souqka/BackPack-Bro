/**
 * Инкрементальный SearchState.
 *
 * Добавление и удаление не вызывают analyzeInventory: обновляются только
 * occupiedCells и geometry нового (или снимаемого) экземпляра.
 */

import { positionKey, resolvePlacedGeometry } from "../inventory/geometry.ts";
import { isInsideInventory } from "../inventory/placement.ts";
import type { Inventory, Item, PlacedItem, ResolvedItemGeometry } from "../inventory/types.ts";
import { canPlaceCandidate } from "./constraints.ts";
import type {
  OccupiedCell,
  PlacementCandidate,
  SearchState,
  SearchStateIssue,
  SearchStateResult,
} from "./types.ts";

export function createSearchState(
  inventory: Inventory,
  items: PlacedItem[] = [],
  catalog?: Map<string, Item>,
): SearchStateResult {
  const occupiedCells = new Map<string, OccupiedCell>();
  const itemGeometries = new Map<string, ResolvedItemGeometry>();
  const issues: SearchStateIssue[] = [];
  const seenInstances = new Set<string>();

  for (const placed of items) {
    if (seenInstances.has(placed.instanceId)) {
      issues.push({
        code: "duplicate_instance",
        instanceId: placed.instanceId,
        itemId: placed.itemId,
        message: `Повторяющийся instanceId: ${placed.instanceId}`,
      });
      continue;
    }
    seenInstances.add(placed.instanceId);

    const item = catalog?.get(placed.itemId);
    if (!item) {
      issues.push({
        code: "unknown_item",
        instanceId: placed.instanceId,
        itemId: placed.itemId,
        message: `Предмет каталога не найден: ${placed.itemId}`,
      });
      continue;
    }

    const geometry = resolvePlacedGeometry(item, placed);
    const outside = geometry.cells.filter((cell) => !isInsideInventory(cell, inventory));
    if (outside.length > 0) {
      issues.push({
        code: "out_of_bounds",
        instanceId: placed.instanceId,
        itemId: placed.itemId,
        message: `Item выходит за границы рюкзака (${outside.length} клеток)`,
        cells: outside,
      });
    }

    for (const cell of geometry.cells) {
      const key = positionKey(cell);
      const existing = occupiedCells.get(key);
      if (existing) {
        issues.push({
          code: "collision",
          instanceId: placed.instanceId,
          itemId: placed.itemId,
          message: `Коллизия на ${key} с ${existing.instanceId}`,
          cells: [cell],
        });
        continue;
      }
      occupiedCells.set(key, {
        instanceId: placed.instanceId,
        itemId: placed.itemId,
        position: cell,
      });
    }
    itemGeometries.set(placed.instanceId, geometry);
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    issues: [],
    state: {
      inventory,
      items: [...items],
      occupiedCells,
      itemGeometries,
    },
  };
}

/**
 * Новое состояние: state N + candidate.
 * Не пересчитывает геометрию уже стоящих предметов.
 */
export function addCandidate(state: SearchState, candidate: PlacementCandidate): SearchState {
  const check = canPlaceCandidate(candidate, state);
  if (!check.valid) {
    const reason = check.reason === "collision" ? "коллизия" : "выход за границы";
    throw new Error(`Нельзя добавить кандидата: ${reason}`);
  }
  if (state.itemGeometries.has(candidate.placement.instanceId)) {
    throw new Error(`Экземпляр уже в состоянии: ${candidate.placement.instanceId}`);
  }

  const occupiedCells = new Map(state.occupiedCells);
  for (const cell of candidate.cells) {
    occupiedCells.set(positionKey(cell), {
      instanceId: candidate.placement.instanceId,
      itemId: candidate.placement.itemId,
      position: cell,
    });
  }

  const itemGeometries = new Map(state.itemGeometries);
  itemGeometries.set(candidate.placement.instanceId, {
    instanceId: candidate.placement.instanceId,
    itemId: candidate.placement.itemId,
    cells: candidate.cells,
    stars: candidate.stars,
  });

  return {
    inventory: state.inventory,
    items: [...state.items, candidate.placement],
    occupiedCells,
    itemGeometries,
  };
}

/**
 * Снимает экземпляр без полного rebuild: удаляются его occupied cells и geometry.
 */
export function removePlacement(state: SearchState, instanceId: string): SearchState {
  const geometry = state.itemGeometries.get(instanceId);
  if (!geometry) return state;

  const occupiedCells = new Map(state.occupiedCells);
  for (const cell of geometry.cells) {
    occupiedCells.delete(positionKey(cell));
  }

  const itemGeometries = new Map(state.itemGeometries);
  itemGeometries.delete(instanceId);

  return {
    inventory: state.inventory,
    items: state.items.filter((placed) => placed.instanceId !== instanceId),
    occupiedCells,
    itemGeometries,
  };
}
