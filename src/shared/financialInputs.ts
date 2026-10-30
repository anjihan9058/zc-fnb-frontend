import type { FinancialMonth } from './analytics';

export const MAX_FINANCIAL_AMOUNT = 1_000_000_000_000;
export type FinancialInputs = Record<string, FinancialMonth>;
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
export function parseFinancialAmount(text: string): number | null {
  if (!text.trim()) return null;
  if (!/^\d+$/.test(text)) throw new Error('금액은 0 이상 1조 원 이하의 정수로 입력해 주세요.');
  const amount = Number(text);
  if (!Number.isSafeInteger(amount) || amount > MAX_FINANCIAL_AMOUNT)
    throw new Error('금액은 0 이상 1조 원 이하의 정수로 입력해 주세요.');
  return amount;
}
function isAmount(value: unknown) {
  return (
    value === null ||
    (typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= 0 &&
      value <= MAX_FINANCIAL_AMOUNT)
  );
}
/** Stored input is untrusted: discard malformed months without replacing missing values with zero. */
export function decodeFinancialInputs(raw: string): FinancialInputs {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const result: FinancialInputs = {};
    for (const [month, row] of Object.entries(value)) {
      if (!monthPattern.test(month) || !row || typeof row !== 'object') continue;
      const r = row as FinancialMonth;
      if (
        r.month !== month ||
        r.entry_source !== 'manual' ||
        !isAmount(r.net_sales) ||
        !isAmount(r.food_cost) ||
        !isAmount(r.labor_cost) ||
        typeof r.operating_expenses_complete !== 'boolean' ||
        !Array.isArray(r.expenses) ||
        r.expenses.length > 100 ||
        !r.expenses.every(
          (e) =>
            e &&
            typeof e.id === 'string' &&
            typeof e.name === 'string' &&
            e.name.trim().length > 0 &&
            e.name.length <= 80 &&
            isAmount(e.amount),
        ) ||
        new Set(r.expenses.map((e) => e.id)).size !== r.expenses.length
      )
        continue;
      result[month] = {
        month,
        entry_source: 'manual',
        net_sales: r.net_sales,
        food_cost: r.food_cost,
        labor_cost: r.labor_cost,
        operating_expenses_complete: r.operating_expenses_complete,
        expenses: r.expenses.map(({ id, name, amount }) => ({ id, name, amount })),
      };
    }
    return result;
  } catch {
    return {};
  }
}

const changeEvent = 'zc-fnb-financial-inputs-changed';
const key = (workspaceId: string) =>
  `zc-fnb:financial-inputs:v1:${encodeURIComponent(workspaceId)}`;
export function readFinancialInputs(workspaceId: string) {
  try {
    return localStorage.getItem(key(workspaceId)) ?? '';
  } catch {
    return '';
  }
}
export function subscribeFinancialInputs(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(changeEvent, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(changeEvent, onChange);
  };
}
/** Read before each write so editing another month does not overwrite its saved input. */
export function writeFinancialInput(
  workspaceId: string,
  month: string,
  row: FinancialMonth | null,
) {
  const inputs = decodeFinancialInputs(readFinancialInputs(workspaceId));
  if (row) {
    const validated = decodeFinancialInputs(JSON.stringify({ [month]: row }))[month];
    if (!validated) throw new Error('저장할 재무 입력값을 확인해 주세요.');
    inputs[month] = validated;
  } else delete inputs[month];
  // A failed browser write must not announce success or replace the displayed saved data.
  localStorage.setItem(key(workspaceId), JSON.stringify(inputs));
  window.dispatchEvent(new Event(changeEvent));
}
