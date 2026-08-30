export interface QuantityLine {
  itemId: string;
  quantity: number;
}

/** UI quantity → production API array. Duplicate ids stay as separate instances. */
export function expandQuantities(lines: readonly QuantityLine[]): string[] {
  const ids: string[] = [];
  for (const line of lines) {
    const count = Math.max(0, Math.floor(line.quantity));
    for (let index = 0; index < count; index++) {
      ids.push(line.itemId);
    }
  }
  return ids;
}

export function setLineQuantity(lines: QuantityLine[], itemId: string, quantity: number): QuantityLine[] {
  const next = Math.max(0, Math.floor(quantity));
  if (next === 0) return lines.filter((line) => line.itemId !== itemId);
  const existing = lines.find((line) => line.itemId === itemId);
  if (!existing) return [...lines, { itemId, quantity: next }];
  return lines.map((line) => (line.itemId === itemId ? { ...line, quantity: next } : line));
}

export function addLine(lines: QuantityLine[], itemId: string, maxQuantity: number): QuantityLine[] {
  const existing = lines.find((line) => line.itemId === itemId);
  const quantity = Math.min(maxQuantity, (existing?.quantity ?? 0) + 1);
  return setLineQuantity(lines, itemId, quantity);
}
