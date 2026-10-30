/** Proposed view-model contract only. No endpoint is assumed or called. All money is KRW. */
export interface AnalysisIngredient {
  id: string;
  name: string;
  unit: string;
  unit_price: number | null;
}
export interface AnalysisRecipe {
  id: string;
  name: string;
  selling_price: number | null;
  ingredients: { ingredient_id: string; quantity: number | null }[];
}
export interface CostSnapshot {
  month: string;
  ingredients: AnalysisIngredient[];
  menus: AnalysisRecipe[];
}
export interface FinancialMonth {
  month: string;
  /** Local test input. Omitted for generated fixtures and API records. */
  entry_source?: 'manual';
  net_sales: number | null;
  food_cost: number | null;
  labor_cost: number | null;
  expenses: { id: string; name: string; amount: number | null }[];
  operating_expenses_complete: boolean;
}
export interface AnalysisDataset {
  schema_version: 1;
  workspace_id: string;
  currency: 'KRW';
  timezone: 'Asia/Seoul';
  source: 'demo' | 'api';
  generated_at: string;
  financials: FinancialMonth[];
  costs: CostSnapshot[];
}
export interface AnalysisInsight {
  title: string;
  summary: string;
  evidence: { label: string; value: string }[];
  limitations: string[];
  origin: 'demo-rule' | 'api-ai';
  workspace_id: string;
  month: string;
}
export const validAmount = (value: number | null | undefined): value is number =>
  value != null && Number.isFinite(value) && value >= 0;
export const money = (value: number) => Math.round(value);
export const ratio = (part: number | null, whole: number | null) =>
  part != null && whole != null && Number.isFinite(part) && Number.isFinite(whole) && whole > 0
    ? (part / whole) * 100
    : null;
/** Absolute prior denominator preserves the direction of changes when prior profit is negative. */
export const growth = (current: number | null, previous: number | null) =>
  current != null &&
  previous != null &&
  Number.isFinite(current) &&
  Number.isFinite(previous) &&
  previous !== 0
    ? ((current - previous) / Math.abs(previous)) * 100
    : null;
export function shiftMonth(month: string, offset: number) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('올바른 기준 월이 필요합니다.');
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 7);
}
export const monthLabel = (month: string) => `${month.slice(0, 4)}년 ${Number(month.slice(5))}월`;
export function recipeCost(snapshot: CostSnapshot | undefined, menuId: string): number | null {
  const menu = snapshot?.menus.find((m) => m.id === menuId);
  if (!menu || !menu.ingredients.length) return null;
  let total = 0;
  for (const row of menu.ingredients) {
    if (!validAmount(row.quantity)) return null;
    if (row.quantity === 0) continue;
    const ingredient = snapshot!.ingredients.find((i) => i.id === row.ingredient_id);
    if (!validAmount(ingredient?.unit_price)) return null;
    total += money(row.quantity * ingredient.unit_price);
  }
  return total;
}
export function simulatePrice(cost: number | null, price: number | null) {
  const usable = validAmount(cost) && validAmount(price) && price > 0;
  return {
    cost_rate: usable ? (cost / price) * 100 : null,
    margin_rate: usable ? ((price - cost) / price) * 100 : null,
    margin_amount: usable ? price - cost : null,
  };
}
export function compareMenu(
  current: CostSnapshot | undefined,
  previous: CostSnapshot | undefined,
  id: string,
) {
  const menu = current?.menus.find((m) => m.id === id),
    old = previous?.menus.find((m) => m.id === id);
  const currentCost = recipeCost(current, id),
    previousCost = recipeCost(previous, id);
  const currentRate = simulatePrice(currentCost, menu?.selling_price ?? null).cost_rate;
  const previousRate = simulatePrice(previousCost, old?.selling_price ?? null).cost_rate;
  return {
    menu,
    currentCost,
    previousCost,
    currentRate,
    previousRate,
    change: currentCost != null && previousCost != null ? currentCost - previousCost : null,
    rateChange: currentRate != null && previousRate != null ? currentRate - previousRate : null,
  };
}
export function ingredientContributions(
  current: CostSnapshot | undefined,
  previous: CostSnapshot | undefined,
  menuId: string,
) {
  const comparison = compareMenu(current, previous, menuId);
  const rows = (comparison.menu?.ingredients ?? []).map((row) => {
    const item = current?.ingredients.find((i) => i.id === row.ingredient_id),
      old = previous?.ingredients.find((i) => i.id === row.ingredient_id);
    const oldRow = previous?.menus
      .find((m) => m.id === menuId)
      ?.ingredients.find((i) => i.ingredient_id === row.ingredient_id);
    // Compare unit-price effects only for the same item and unit with a known previous recipe.
    const effect =
      oldRow &&
      item &&
      old &&
      item.unit === old.unit &&
      validAmount(row.quantity) &&
      validAmount(item.unit_price) &&
      validAmount(old.unit_price)
        ? money(row.quantity * item.unit_price) - money(row.quantity * old.unit_price)
        : null;
    return {
      id: row.ingredient_id,
      name: item?.name ?? row.ingredient_id,
      unit: item?.unit ?? '',
      quantity: row.quantity,
      currentPrice: item?.unit_price ?? null,
      previousPrice: old?.unit_price ?? null,
      effect,
    };
  });
  const positive = rows.reduce((n, r) => n + Math.max(0, r.effect ?? 0), 0);
  const priceEffect = rows.reduce((n, r) => n + (r.effect ?? 0), 0);
  return {
    rows: rows
      .map((r) => ({
        ...r,
        share:
          r.effect != null && r.effect > 0 && positive > 0 ? (r.effect / positive) * 100 : null,
      }))
      .sort((a, b) => Math.abs(b.effect ?? 0) - Math.abs(a.effect ?? 0)),
    priceEffect,
    residual: comparison.change == null ? null : comparison.change - priceEffect,
  };
}
export function financialMetrics(row: FinancialMonth | undefined) {
  const sales = validAmount(row?.net_sales) ? row.net_sales : null,
    food = validAmount(row?.food_cost) ? row.food_cost : null,
    labor = validAmount(row?.labor_cost) ? row.labor_cost : null;
  const other =
    row?.operating_expenses_complete &&
    row.expenses.length > 0 &&
    row.expenses.every((e) => validAmount(e.amount))
      ? row.expenses.reduce((n, e) => n + e.amount!, 0)
      : null;
  const grossProfit = sales != null && food != null ? sales - food : null;
  const totalCost = food != null && labor != null && other != null ? food + labor + other : null;
  const operatingProfit = sales != null && totalCost != null ? sales - totalCost : null;
  return {
    sales,
    food,
    labor,
    other,
    totalCost,
    grossProfit,
    operatingProfit,
    foodRate: ratio(food, sales),
    laborRate: ratio(labor, sales),
  };
}
export function financialSeries(dataset: AnalysisDataset, endMonth: string, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const month = shiftMonth(endMonth, i - count + 1),
      row = dataset.financials.find((m) => m.month === month);
    return { month, label: month.slice(2).replace('-', '.'), ...financialMetrics(row) };
  });
}
