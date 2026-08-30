/**
 * Incremental placement scoring.
 *
 * Rebuilds InventoryAnalysis for the next layout by recomputing only Star
 * overlaps whose source is in the affected region, then calls the canonical
 * scoreInventoryAnalysis. Never applies an estimated numeric delta.
 */

import { buildCellIndex } from "../../inventory/collision.ts";
import { analyzeInventoryWithResolved } from "../../inventory/inventory.ts";
import { findStarOverlaps } from "../../inventory/stars.ts";
import type { Item, StarOverlap } from "../../inventory/types.ts";
import { getStateSignature } from "../../optimizer/deduplication.ts";
import type { OptimizerState } from "../../optimizer/search-types.ts";
import { getBoundInventoryAnalysis } from "../analysis-bind.ts";
import { analyzePlacementScore, scoreInventoryAnalysis } from "../analyzer.ts";
import { collectAffectedRegion } from "./affected.ts";
import { geometryFingerprint, itemGeometryChanges, snapshotPlaced } from "./move.ts";
import { isIncrementalVerificationEnabled } from "./options.ts";
import type { IncrementalScoreContext, IncrementalScoreResult, LayoutMove } from "./types.ts";
import { placementScoresEquivalent } from "./verify.ts";

export function tryIncrementalPlacementScore(
  nextState: OptimizerState,
  catalog: Map<string, Item>,
  context: IncrementalScoreContext,
): IncrementalScoreResult {
  const fallback = (reason: string): IncrementalScoreResult => {
    const score = analyzePlacementScore(inventoryState(nextState), catalog);
    return {
      score,
      mode: "full_fallback",
      affectedInstanceIds: [],
      affectedInteractionCount: 0,
      affectedStarCount: 0,
      reason,
    };
  };

  if (!context.previousScore.valid) {
    return fallback("previous score invalid");
  }
  if (!nextGeometriesComplete(nextState)) {
    return fallback("next geometries incomplete");
  }

  if (getStateSignature(context.previousState.items) === getStateSignature(nextState.items)) {
    const reused = reusePreviousScore(context);
    return maybeVerify(nextState, catalog, reused);
  }

  const moves = effectiveMoves(context.previousState, nextState, context.moves);
  if (!moves) {
    return fallback("could not determine item geometry changes");
  }
  if (!movesMatchStates(moves, context.previousState, nextState)) {
    return fallback("move metadata does not match layouts");
  }

  const affected = collectAffectedRegion(moves, context.previousState.items, nextState.items);
  expandAddedAndRemoved(context.previousState, nextState, affected.instanceIds);
  if (affected.instanceIds.size === 0) {
    return fallback("items changed but affected set is empty");
  }

  const previousAnalysis =
    getBoundInventoryAnalysis(context.previousScore) ??
    analyzeInventoryWithResolved(
      inventoryState(context.previousState),
      catalog,
      context.previousState.items.itemGeometries,
    );

  const nextInventory = inventoryState(nextState);
  const nextResolved = nextState.items.itemGeometries;
  const cellIndex = buildCellIndex(nextInventory.items, catalog, nextResolved);
  const overlaps = mergeStarOverlaps(
    previousAnalysis.starOverlaps,
    nextInventory.items,
    catalog,
    cellIndex,
    nextResolved,
    affected.instanceIds,
  );

  const analysis = analyzeInventoryWithResolved(nextInventory, catalog, nextResolved, overlaps.merged);
  const score = scoreInventoryAnalysis(analysis, nextInventory, catalog);
  const result: IncrementalScoreResult = {
    score,
    mode: "incremental",
    affectedInstanceIds: [...affected.instanceIds].sort(),
    affectedInteractionCount: overlaps.recomputed,
    affectedStarCount: affected.starPositions.size,
  };
  return maybeVerify(nextState, catalog, result);
}

function reusePreviousScore(context: IncrementalScoreContext): IncrementalScoreResult {
  return {
    score: context.previousScore,
    mode: "incremental",
    affectedInstanceIds: [],
    affectedInteractionCount: 0,
    affectedStarCount: 0,
    reason: "items unchanged",
  };
}

function maybeVerify(
  nextState: OptimizerState,
  catalog: Map<string, Item>,
  result: IncrementalScoreResult,
): IncrementalScoreResult {
  if (result.mode !== "incremental" || !isIncrementalVerificationEnabled()) return result;
  const full = analyzePlacementScore(inventoryState(nextState), catalog);
  if (placementScoresEquivalent(result.score, full)) return result;
  return {
    score: full,
    mode: "full_fallback",
    affectedInstanceIds: result.affectedInstanceIds,
    affectedInteractionCount: result.affectedInteractionCount,
    affectedStarCount: result.affectedStarCount,
    reason: "verification mismatch",
  };
}

function mergeStarOverlaps(
  previous: StarOverlap[],
  nextItems: OptimizerState["items"]["items"],
  catalog: Map<string, Item>,
  cellIndex: ReturnType<typeof buildCellIndex>,
  resolved: OptimizerState["items"]["itemGeometries"],
  affectedSources: Set<string>,
): { merged: StarOverlap[]; recomputed: number } {
  const previousBySource = new Map<string, StarOverlap[]>();
  for (const overlap of previous) {
    const list = previousBySource.get(overlap.sourceInstanceId);
    if (list) list.push(overlap);
    else previousBySource.set(overlap.sourceInstanceId, [overlap]);
  }

  const merged: StarOverlap[] = [];
  let recomputed = 0;
  for (const placed of nextItems) {
    if (affectedSources.has(placed.instanceId)) {
      const part = findStarOverlaps([placed], catalog, cellIndex, resolved);
      merged.push(...part);
      recomputed += part.length;
    } else {
      const kept = previousBySource.get(placed.instanceId);
      if (kept) merged.push(...kept);
    }
  }
  return { merged, recomputed };
}

function effectiveMoves(
  previous: OptimizerState,
  next: OptimizerState,
  moves: LayoutMove[],
): LayoutMove[] | null {
  const described = itemGeometryChanges(moves);
  if (described.length > 0) return moves;
  const inferred = inferItemChanges(previous, next);
  return inferred;
}

function inferItemChanges(previous: OptimizerState, next: OptimizerState): LayoutMove[] | null {
  const changes: ReturnType<typeof itemGeometryChanges> = [];
  const prevIds = new Set(previous.items.items.map((item) => item.instanceId));
  const nextIds = new Set(next.items.items.map((item) => item.instanceId));

  for (const placed of previous.items.items) {
    if (nextIds.has(placed.instanceId)) continue;
    const snapshot = snapshotPlaced(previous.items, placed.instanceId);
    if (!snapshot) return null;
    changes.push({ instanceId: placed.instanceId, itemId: placed.itemId, previous: snapshot });
  }
  for (const placed of next.items.items) {
    if (prevIds.has(placed.instanceId)) continue;
    const snapshot = snapshotPlaced(next.items, placed.instanceId);
    if (!snapshot) return null;
    changes.push({ instanceId: placed.instanceId, itemId: placed.itemId, next: snapshot });
  }
  for (const placed of next.items.items) {
    if (!prevIds.has(placed.instanceId)) continue;
    const prevPlaced = previous.items.items.find((item) => item.instanceId === placed.instanceId);
    if (!prevPlaced) continue;
    if (
      prevPlaced.position.row === placed.position.row &&
      prevPlaced.position.col === placed.position.col &&
      prevPlaced.rotation === placed.rotation
    ) {
      continue;
    }
    const prevSnap = snapshotPlaced(previous.items, placed.instanceId);
    const nextSnap = snapshotPlaced(next.items, placed.instanceId);
    if (!prevSnap || !nextSnap) return null;
    changes.push({
      instanceId: placed.instanceId,
      itemId: placed.itemId,
      previous: prevSnap,
      next: nextSnap,
    });
  }
  if (changes.length === 0) return null;
  return [{ type: "repair", instanceIds: changes.map((change) => change.instanceId), changes }];
}

function movesMatchStates(
  moves: LayoutMove[],
  previous: OptimizerState,
  next: OptimizerState,
): boolean {
  for (const change of itemGeometryChanges(moves)) {
    if (change.previous) {
      const actual = snapshotPlaced(previous.items, change.instanceId);
      if (!actual || geometryFingerprint(actual) !== geometryFingerprint(change.previous)) return false;
    }
    if (change.next) {
      const actual = snapshotPlaced(next.items, change.instanceId);
      if (!actual || geometryFingerprint(actual) !== geometryFingerprint(change.next)) return false;
    }
    if (!change.previous && !change.next) return false;
  }
  return true;
}

function expandAddedAndRemoved(
  previous: OptimizerState,
  next: OptimizerState,
  instanceIds: Set<string>,
): void {
  const prevIds = new Set(previous.items.items.map((item) => item.instanceId));
  const nextIds = new Set(next.items.items.map((item) => item.instanceId));
  for (const id of prevIds) {
    if (!nextIds.has(id)) instanceIds.add(id);
  }
  for (const id of nextIds) {
    if (!prevIds.has(id)) instanceIds.add(id);
  }
}

function nextGeometriesComplete(state: OptimizerState): boolean {
  for (const placed of state.items.items) {
    if (!state.items.itemGeometries.has(placed.instanceId)) return false;
  }
  return true;
}

function inventoryState(state: OptimizerState) {
  return { inventory: state.backpack, items: state.items.items };
}
