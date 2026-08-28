/**
 * Подписи состояния и кандидата для будущей дедупликации поиска.
 *
 * Не включают score и synergy. Порядок items в массиве не влияет на state signature.
 */

import type { PlacementCandidate, SearchState } from "./types.ts";

export function getCandidateSignature(candidate: PlacementCandidate): string {
  const { instanceId, itemId, position, rotation } = candidate.placement;
  return `${instanceId}:${itemId}:${position.row}:${position.col}:${rotation}`;
}

export function getStateSignature(state: SearchState): string {
  const lines = state.items.map((placed) => {
    return `${placed.instanceId}:${placed.itemId}:${placed.position.row}:${placed.position.col}:${placed.rotation}`;
  });
  lines.sort();
  return lines.join("\n");
}
