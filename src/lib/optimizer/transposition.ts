/**
 * Run-scoped transposition table for equivalent partial search states.
 *
 * Equivalence is defined by the partial-state signature (placed geometry +
 * remaining multiset). Heuristic is never used to prune a different future
 * search space. Among equivalent keys the first feasible representative
 * wins: equivalent states share the same heuristic, so this matches
 * selectBeam's equal-score first-wins rule without scoring the duplicate.
 *
 * Each Item Beam / Bag Beam / Repair Beam call creates its own table.
 * Adaptive ladder levels must not share a table: a state pruned at width 1
 * may be worth expanding at width 20.
 */

export interface TranspositionMetrics {
  transpositionHits: number;
  transpositionPruned: number;
  transpositionAccepted: number;
  transpositionReplacements: number;
}

export interface TranspositionTable {
  readonly enabled: boolean;
  has(signature: string): boolean;
  get(signature: string): number | undefined;
  shouldAccept(signature: string, heuristic?: number): boolean;
  snapshot(): TranspositionMetrics;
}

const EMPTY_METRICS: TranspositionMetrics = {
  transpositionHits: 0,
  transpositionPruned: 0,
  transpositionAccepted: 0,
  transpositionReplacements: 0,
};

let enabledStack: boolean[] = [];

export function withTranspositionEnabled<T>(enabled: boolean, fn: () => T): T {
  enabledStack.push(enabled);
  try {
    return fn();
  } finally {
    enabledStack.pop();
  }
}

export function isTranspositionEnabled(): boolean {
  const top = enabledStack[enabledStack.length - 1];
  return top !== false;
}

export function createTranspositionTable(options?: { enabled?: boolean }): TranspositionTable {
  const enabled = options?.enabled ?? isTranspositionEnabled();
  return new MapTranspositionTable(enabled);
}

export function pruneIfSeen(table: TranspositionTable, signature: string): boolean {
  return table.enabled && !table.shouldAccept(signature);
}

export function addTranspositionMetrics(
  target: TranspositionMetrics,
  snapshot: TranspositionMetrics,
): void {
  target.transpositionHits += snapshot.transpositionHits;
  target.transpositionPruned += snapshot.transpositionPruned;
  target.transpositionAccepted += snapshot.transpositionAccepted;
  target.transpositionReplacements += snapshot.transpositionReplacements;
}

class MapTranspositionTable implements TranspositionTable {
  readonly enabled: boolean;
  private readonly store = new Map<string, number>();
  private hits = 0;
  private pruned = 0;
  private accepted = 0;
  private replacements = 0;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  has(signature: string): boolean {
    return this.store.has(signature);
  }

  get(signature: string): number | undefined {
    return this.store.get(signature);
  }

  shouldAccept(signature: string, heuristic?: number): boolean {
    if (!this.enabled) return true;
    const previous = this.store.get(signature);
    if (previous === undefined) {
      this.store.set(signature, heuristic ?? Number.NEGATIVE_INFINITY);
      this.accepted += 1;
      return true;
    }
    this.hits += 1;
    if (heuristic !== undefined && heuristic > previous) {
      this.store.set(signature, heuristic);
      this.replacements += 1;
      this.accepted += 1;
      return true;
    }
    this.pruned += 1;
    return false;
  }

  snapshot(): TranspositionMetrics {
    if (!this.enabled) return { ...EMPTY_METRICS };
    return {
      transpositionHits: this.hits,
      transpositionPruned: this.pruned,
      transpositionAccepted: this.accepted,
      transpositionReplacements: this.replacements,
    };
  }
}
