const measures: Record<string, { kind: string; factor: number }> = {
  kg: { kind: 'weight', factor: 1000 },
  g: { kind: 'weight', factor: 1 },
  L: { kind: 'volume', factor: 1000 },
  l: { kind: 'volume', factor: 1000 },
  mL: { kind: 'volume', factor: 1 },
  ml: { kind: 'volume', factor: 1 },
};
/** Factor from recipe quantity to purchase quantity. Packages require explicit product specifications. */
export function unitFactor(from: string, to: string): number | null {
  if (!from || !to) return null;
  if (from === to) return 1;
  const a = measures[from],
    b = measures[to];
  return a && b && a.kind === b.kind ? a.factor / b.factor : null;
}
export function recipeUnits(purchaseUnit: string) {
  if (['kg', 'g'].includes(purchaseUnit)) return ['kg', 'g'];
  if (['L', 'l', 'ml', 'mL'].includes(purchaseUnit)) return [...new Set([purchaseUnit, 'L', 'mL'])];
  return purchaseUnit ? [purchaseUnit] : [];
}
