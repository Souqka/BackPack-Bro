/**
 * SynergyGraph: рёбра только по подтверждённым или явно видимым взаимодействиям.
 * Соседство клеток само по себе ребра не создаёт.
 */

import type { InventoryState } from "../inventory/types.ts";
import type { Synergy, SynergyEdge, SynergyGraph, SynergyNode } from "./types.ts";

export function buildSynergyGraph(state: InventoryState, synergies: Synergy[]): SynergyGraph {
  const nodes: SynergyNode[] = state.items.map((placed) => ({
    id: placed.instanceId,
    instanceId: placed.instanceId,
    itemId: placed.itemId,
  }));

  const edges: SynergyEdge[] = [];
  for (const synergy of synergies) {
    if (synergy.type === "star_effect") continue;
    for (const target of synergy.targetInstanceIds) {
      edges.push({
        id: `edge:${synergy.id}:${target}`,
        source: synergy.sourceInstanceId,
        target,
        synergyId: synergy.id,
        type: synergy.type,
        active: synergy.status === "active",
      });
    }
  }

  return { nodes, edges };
}
