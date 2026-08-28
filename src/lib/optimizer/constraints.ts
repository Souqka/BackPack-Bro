/**
 * Проверка кандидата против SearchState.
 *
 * Только Item cells: внутри сетки и не на occupiedCells.
 * Star не создаёт collision и не влияет на границы.
 * Сложность: O(клетки кандидата).
 */

import { isInsideInventory } from "../inventory/placement.ts";
import { positionKey } from "../inventory/geometry.ts";
import type { CandidateValidationResult, PlacementCandidate, SearchState } from "./types.ts";

export function canPlaceCandidate(
  candidate: PlacementCandidate,
  state: SearchState,
): CandidateValidationResult {
  const outside: typeof candidate.cells = [];
  const colliding: typeof candidate.cells = [];

  for (const cell of candidate.cells) {
    if (!isInsideInventory(cell, state.inventory)) {
      outside.push(cell);
      continue;
    }
    if (state.occupiedCells.has(positionKey(cell))) colliding.push(cell);
  }

  if (outside.length > 0) {
    return { valid: false, reason: "out_of_bounds", cells: outside };
  }
  if (colliding.length > 0) {
    return { valid: false, reason: "collision", cells: colliding };
  }
  if (candidate.cells.length === 0) {
    return { valid: false, reason: "out_of_bounds" };
  }
  return { valid: true };
}
