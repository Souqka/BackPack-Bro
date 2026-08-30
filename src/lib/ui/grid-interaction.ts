import type { OptimizedStarActivation } from "../optimizer/api/types.ts";

export interface GridInteractionState {
  hoveredInstanceId: string | null;
  previewSynergyId: string | null;
  selectedSynergyId: string | null;
}

export type ItemVisualRole = "source" | "target" | "hovered" | "dimmed" | "normal";

export function synergyId(activation: Pick<OptimizedStarActivation, "sourceInstanceId" | "targetInstanceId" | "row" | "col">): string {
  return `${activation.sourceInstanceId}:${activation.targetInstanceId}:${activation.row}:${activation.col}`;
}

/** Hovered synergy previews over a persisted selection. */
export function resolveActiveSynergy(
  activations: readonly OptimizedStarActivation[],
  hoveredSynergyId: string | null,
  selectedSynergyId: string | null,
): OptimizedStarActivation | null {
  const id = hoveredSynergyId ?? selectedSynergyId;
  if (!id) return null;
  return activations.find((entry) => synergyId(entry) === id) ?? null;
}

export function toggleSynergySelection(current: string | null, clicked: string): string | null {
  return current === clicked ? null : clicked;
}

/**
 * Visual priority: selected/hovered synergy, then item hover, then normal.
 * Unrelated items dim while a synergy is active.
 */
export function resolveItemVisualRole(
  instanceId: string,
  synergy: OptimizedStarActivation | null,
  hoveredInstanceId: string | null,
): ItemVisualRole {
  if (synergy) {
    if (instanceId === synergy.sourceInstanceId) return "source";
    if (instanceId === synergy.targetInstanceId) return "target";
    return "dimmed";
  }
  if (hoveredInstanceId === instanceId) return "hovered";
  return "normal";
}
