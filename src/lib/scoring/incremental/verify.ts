/**
 * Semantic equality of PlacementScore.
 *
 * Ranking does not depend on synergy / graph array order. Comparison is by
 * values of ranking-relevant fields plus interaction identity sets.
 */

import type { PlacementScore, Synergy, SynergyEdge, SynergyNode } from "../types.ts";

export class PlacementScoreMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlacementScoreMismatchError";
  }
}

export function placementScoresEquivalent(a: PlacementScore, b: PlacementScore): boolean {
  return placementScoreDiff(a, b) === null;
}

export function assertEquivalentPlacementScore(a: PlacementScore, b: PlacementScore, label = ""): void {
  const diff = placementScoreDiff(a, b);
  if (diff) {
    const prefix = label ? `${label}: ` : "";
    throw new PlacementScoreMismatchError(`${prefix}${diff}`);
  }
}

export function placementScoreDiff(a: PlacementScore, b: PlacementScore): string | null {
  if (a.valid !== b.valid) return `valid ${a.valid} !== ${b.valid}`;
  if (a.score !== b.score) return `score ${a.score} !== ${b.score}`;
  if (a.breakdown.activatedStars !== b.breakdown.activatedStars) {
    return `activatedStars ${a.breakdown.activatedStars} !== ${b.breakdown.activatedStars}`;
  }
  if (a.breakdown.unsupportedInteractions !== b.breakdown.unsupportedInteractions) {
    return `unsupportedInteractions ${a.breakdown.unsupportedInteractions} !== ${b.breakdown.unsupportedInteractions}`;
  }
  if (a.breakdown.unknownInteractions !== b.breakdown.unknownInteractions) {
    return `unknownInteractions ${a.breakdown.unknownInteractions} !== ${b.breakdown.unknownInteractions}`;
  }
  if (a.breakdown.itemsPlaced !== b.breakdown.itemsPlaced) {
    return `itemsPlaced ${a.breakdown.itemsPlaced} !== ${b.breakdown.itemsPlaced}`;
  }
  if (a.breakdown.occupiedCells !== b.breakdown.occupiedCells) {
    return `occupiedCells ${a.breakdown.occupiedCells} !== ${b.breakdown.occupiedCells}`;
  }
  if (a.breakdown.emptyCells !== b.breakdown.emptyCells) {
    return `emptyCells ${a.breakdown.emptyCells} !== ${b.breakdown.emptyCells}`;
  }
  if (a.effectCoverage.totalActiveEffects !== b.effectCoverage.totalActiveEffects) {
    return `totalActiveEffects ${a.effectCoverage.totalActiveEffects} !== ${b.effectCoverage.totalActiveEffects}`;
  }
  if (a.effectCoverage.normalizedEffects !== b.effectCoverage.normalizedEffects) {
    return `normalizedEffects ${a.effectCoverage.normalizedEffects} !== ${b.effectCoverage.normalizedEffects}`;
  }
  if (a.effectCoverage.rawEffects !== b.effectCoverage.rawEffects) {
    return `rawEffects ${a.effectCoverage.rawEffects} !== ${b.effectCoverage.rawEffects}`;
  }
  if (a.effectCoverage.unsupportedEffects !== b.effectCoverage.unsupportedEffects) {
    return `unsupportedEffects ${a.effectCoverage.unsupportedEffects} !== ${b.effectCoverage.unsupportedEffects}`;
  }

  const synergyA = synergyKeys(a.synergies);
  const synergyB = synergyKeys(b.synergies);
  if (synergyA !== synergyB) return `synergies ${synergyA} !== ${synergyB}`;

  const nodesA = nodeKeys(a.graph.nodes);
  const nodesB = nodeKeys(b.graph.nodes);
  if (nodesA !== nodesB) return `graph.nodes ${nodesA} !== ${nodesB}`;

  const edgesA = edgeKeys(a.graph.edges);
  const edgesB = edgeKeys(b.graph.edges);
  if (edgesA !== edgesB) return `graph.edges ${edgesA} !== ${edgesB}`;

  const componentsA = componentKeys(a.breakdown.components);
  const componentsB = componentKeys(b.breakdown.components);
  if (componentsA !== componentsB) return `breakdown.components ${componentsA} !== ${componentsB}`;

  return null;
}

function synergyKeys(synergies: Synergy[]): string {
  return [...synergies]
    .map((synergy) =>
      [
        synergy.id,
        synergy.type,
        synergy.sourceInstanceId,
        [...synergy.targetInstanceIds].sort().join(","),
        String(synergy.score),
        synergy.status,
        synergy.reason ?? "",
      ].join("|"),
    )
    .sort()
    .join("\n");
}

function nodeKeys(nodes: SynergyNode[]): string {
  return [...nodes]
    .map((node) => `${node.id}|${node.instanceId}|${node.itemId}`)
    .sort()
    .join("\n");
}

function edgeKeys(edges: SynergyEdge[]): string {
  return [...edges]
    .map((edge) => `${edge.id}|${edge.source}|${edge.target}|${edge.synergyId}|${edge.type}|${edge.active}`)
    .sort()
    .join("\n");
}

function componentKeys(components: PlacementScore["breakdown"]["components"]): string {
  return [...components]
    .map(
      (component) =>
        `${component.type}|${component.score}|${component.sourceInstanceId ?? ""}|${component.targetInstanceId ?? ""}|${component.reason}`,
    )
    .sort()
    .join("\n");
}
