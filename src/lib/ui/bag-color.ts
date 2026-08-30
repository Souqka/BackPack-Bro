/**
 * Presentation-only deterministic Bag colors.
 * Catalog has no UI color field — do not put these hues in scoring or items.json.
 */

export interface BagColor {
  hue: number;
  fill: string;
  border: string;
}

export function bagColorForItemId(itemId: string): BagColor {
  const hue = hashHue(itemId);
  return {
    hue,
    fill: `hsla(${hue}, 58%, 28%, 0.72)`,
    border: `hsl(${hue}, 72%, 62%)`,
  };
}

function hashHue(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 360;
}
