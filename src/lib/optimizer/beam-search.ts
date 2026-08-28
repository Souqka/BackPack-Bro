/**
 * Primitive Beam Search: оставляет top N состояний по heuristic.
 *
 * Детерминизм: при равном score — лексикографический signature.
 * Shared state не мутируется.
 */

import type { BeamSearchOptions } from "./search-types.ts";

export interface ScoredBeamState<S> {
  state: S;
  score: number;
  signature: string;
}

export function selectBeam<S>(
  states: ScoredBeamState<S>[],
  options: BeamSearchOptions,
): ScoredBeamState<S>[] {
  const unique = new Map<string, ScoredBeamState<S>>();
  for (const node of states) {
    const prev = unique.get(node.signature);
    if (!prev || node.score > prev.score) unique.set(node.signature, node);
  }
  const ranked = [...unique.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.signature < b.signature ? -1 : a.signature > b.signature ? 1 : 0;
  });
  const limited = options.maxStates !== undefined ? ranked.slice(0, options.maxStates) : ranked;
  return limited.slice(0, options.beamWidth);
}

export function pastDeadline(deadlineMs?: number): boolean {
  return deadlineMs !== undefined && Date.now() >= deadlineMs;
}
