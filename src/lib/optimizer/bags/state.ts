/**
 * Инкрементальный BagState.
 *
 * availableCells = объединение Bag cells. Collision Bag+Bag — занятость клетки рюкзака.
 * Каталог не описывает перекрытие Bags: две Bags не делят одну клетку 6×9.
 */

import { positionKey, resolvePlacedGeometry } from "../../inventory/geometry.ts";
import { isInsideInventory } from "../../inventory/placement.ts";
import type { Item, ResolvedItemGeometry } from "../../inventory/types.ts";
import { canPlaceCandidate } from "../constraints.ts";
import type { Backpack, PlacementCandidate, SearchState } from "../types.ts";
import type { BagState, OccupiedBagCell, PlacedBag } from "./types.ts";

export function emptyBagState(): BagState {
  return {
    bags: [],
    occupiedCells: new Map(),
    availableCells: new Set(),
    geometries: new Map(),
  };
}

export function bagStateAsSearchState(bags: BagState, backpack: Backpack): SearchState {
  return {
    inventory: backpack,
    items: bags.bags,
    occupiedCells: bags.occupiedCells,
    itemGeometries: bags.geometries,
  };
}

export function createBagState(
  backpack: Backpack,
  bags: PlacedBag[] = [],
  catalog?: Map<string, Item>,
): { ok: true; state: BagState } | { ok: false; issues: string[] } {
  const state = emptyBagState();
  const issues: string[] = [];
  const seen = new Set<string>();

  for (const bag of bags) {
    if (seen.has(bag.instanceId)) {
      issues.push(`Повторяющийся instanceId Bag: ${bag.instanceId}`);
      continue;
    }
    seen.add(bag.instanceId);
    const item = catalog?.get(bag.itemId);
    if (!item) {
      issues.push(`Неизвестный bag itemId: ${bag.itemId}`);
      continue;
    }
    if (!item.types.includes("bag")) {
      issues.push(`Предмет не является Bag: ${bag.itemId}`);
      continue;
    }
    const geometry = resolvePlacedGeometry(item, bag);
    const outside = geometry.cells.filter((cell) => !isInsideInventory(cell, backpack));
    if (outside.length > 0) {
      issues.push(`Bag ${bag.instanceId} выходит за границы рюкзака`);
    }
    for (const cell of geometry.cells) {
      const key = positionKey(cell);
      if (state.occupiedCells.has(key)) {
        issues.push(`Коллизия Bags на ${key}`);
      }
    }
    state.bags.push(bag);
    applyBagGeometry(state, bag, geometry);
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, state };
}

export function addBagCandidate(state: BagState, candidate: PlacementCandidate, backpack: Backpack): BagState {
  const check = canPlaceCandidate(candidate, bagStateAsSearchState(state, backpack));
  if (!check.valid) {
    throw new Error("Нельзя добавить Bag: коллизия или выход за границы рюкзака");
  }
  if (state.geometries.has(candidate.placement.instanceId)) {
    throw new Error(`Экземпляр Bag уже в состоянии: ${candidate.placement.instanceId}`);
  }
  const next: BagState = {
    bags: [...state.bags, candidate.placement],
    occupiedCells: new Map(state.occupiedCells),
    availableCells: new Set(state.availableCells),
    geometries: new Map(state.geometries),
  };
  applyBagGeometry(next, candidate.placement, {
    instanceId: candidate.placement.instanceId,
    itemId: candidate.placement.itemId,
    cells: candidate.cells,
    stars: candidate.stars,
  });
  return next;
}

/**
 * Снимает одну Bag и пересчитывает occupiedCells / availableCells
 * по оставшимся geometry. Каталог не нужен: geometry уже в state.
 */
export function removeBag(state: BagState, instanceId: string): BagState {
  const next = emptyBagState();
  for (const bag of state.bags) {
    if (bag.instanceId === instanceId) continue;
    const geometry = state.geometries.get(bag.instanceId);
    if (!geometry) continue;
    next.bags.push(bag);
    applyBagGeometry(next, bag, geometry);
  }
  return next;
}

/**
 * Клетки, на которые можно ставить Items. Это union Bag cells.
 */
export function getAvailableCells(bags: BagState): ReadonlySet<string> {
  return bags.availableCells;
}

function applyBagGeometry(state: BagState, bag: PlacedBag, geometry: ResolvedItemGeometry): void {
  for (const cell of geometry.cells) {
    const key = positionKey(cell);
    const occupant: OccupiedBagCell = {
      instanceId: bag.instanceId,
      itemId: bag.itemId,
      position: cell,
    };
    state.occupiedCells.set(key, occupant);
    state.availableCells.add(key);
  }
  state.geometries.set(bag.instanceId, geometry);
}

export function getBagStateSignature(state: BagState): string {
  const lines = state.bags.map((bag) => {
    return `${bag.instanceId}:${bag.itemId}:${bag.position.row}:${bag.position.col}:${bag.rotation}`;
  });
  lines.sort();
  return lines.join("\n");
}
