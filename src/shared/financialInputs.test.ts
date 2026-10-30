import { expect, it } from 'vitest';
import { decodeFinancialInputs, parseFinancialAmount } from './financialInputs';
it('금액은 빈칸과 0을 구분하고 음수·소수·지수·무한대·범위 초과를 거부한다', () => {
  expect(parseFinancialAmount('')).toBeNull();
  expect(parseFinancialAmount('0')).toBe(0);
  expect(parseFinancialAmount('1000000000000')).toBe(1000000000000);
  for (const text of ['-1', '1.5', '1e6', 'NaN', 'Infinity', '1000000000001'])
    expect(() => parseFinancialAmount(text)).toThrow();
});
it('손상된 브라우저 데이터는 무시하고 유효한 달의 0원·미기재를 보존한다', () => {
  const row = {
    month: '2026-10',
    entry_source: 'manual',
    net_sales: 0,
    food_cost: null,
    labor_cost: 0,
    expenses: [{ id: 'rent', name: '임대료', amount: 0 }],
    operating_expenses_complete: false,
  };
  expect(decodeFinancialInputs('bad json')).toEqual({});
  expect(
    decodeFinancialInputs(
      JSON.stringify({ '2026-10': row, '2026-09': { ...row, month: '2026-09', food_cost: -1 } }),
    ),
  ).toEqual({ '2026-10': row });
  expect(
    decodeFinancialInputs(JSON.stringify({ '2026-10': { ...row, expenses: [null] } })),
  ).toEqual({});
});
