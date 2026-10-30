import { describe, expect, it } from 'vitest';
import {
  compareMenu,
  financialMetrics,
  financialSeries,
  growth,
  ingredientContributions,
  ratio,
  recipeCost,
  shiftMonth,
  simulatePrice,
  type CostSnapshot,
} from './analytics';
import { createAnalysisDemo, demoCostInsight, demoFinancialInsight } from '../mocks/analytics';

const snapshot = (
  month: string,
  pork: number | null = 10000,
  qty: number | null = 0.2,
): CostSnapshot => ({
  month,
  ingredients: [
    { id: 'pork', name: '돼지고기', unit: 'kg', unit_price: pork },
    { id: 'onion', name: '양파', unit: 'kg', unit_price: 2000 },
  ],
  menus: [
    {
      id: 'm',
      name: '덮밥',
      selling_price: 10000,
      ingredients: [
        { ingredient_id: 'pork', quantity: qty },
        { ingredient_id: 'onion', quantity: 0.1 },
      ],
    },
  ],
});
describe('월간 원가 비교와 시뮬레이션', () => {
  it('연도 경계를 넘어 정확한 전월을 선택한다', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(() => shiftMonth('2026-13', -1)).toThrow();
  });
  it('재료별 금액 합계, 원가율, 퍼센트포인트 차이를 일치시킨다', () => {
    const c = compareMenu(snapshot('2026-10', 12000), snapshot('2026-09'), 'm');
    expect(c.previousCost).toBe(2200);
    expect(c.currentCost).toBe(2600);
    expect(c.change).toBe(400);
    expect(c.previousRate).toBe(22);
    expect(c.currentRate).toBe(26);
    expect(c.rateChange).toBe(4);
  });
  it('단가 효과와 구성 변화를 분리해 메뉴 변화와 합계를 맞춘다', () => {
    const now = snapshot('2026-10', 12000, 0.3),
      old = snapshot('2026-09');
    const c = ingredientContributions(now, old, 'm');
    expect(c.priceEffect).toBe(600);
    expect(c.residual).toBe(1000);
    expect(c.priceEffect + c.residual!).toBe(compareMenu(now, old, 'm').change);
  });
  it('인하 효과가 있어도 상승 기여 비중은 양의 효과 합계 기준으로 계산한다', () => {
    const now = snapshot('2026-10', 12000),
      old = snapshot('2026-09');
    now.ingredients[1].unit_price = 1000;
    const c = ingredientContributions(now, old, 'm');
    expect(c.rows.find((r) => r.id === 'pork')?.share).toBe(100);
    expect(c.rows.find((r) => r.id === 'onion')?.share).toBeNull();
    expect(c.priceEffect).toBe(300);
  });
  it('단가·수량·전월 스냅샷 누락과 단위 변경은 비교 불가로 남긴다', () => {
    expect(recipeCost(snapshot('2026-10', null), 'm')).toBeNull();
    expect(recipeCost(snapshot('2026-10', 10000, null), 'm')).toBeNull();
    expect(compareMenu(snapshot('2026-10'), undefined, 'm').change).toBeNull();
    const old = snapshot('2026-09');
    old.ingredients[0].unit = 'box';
    expect(
      ingredientContributions(snapshot('2026-10'), old, 'm').rows.find((r) => r.id === 'pork')
        ?.effect,
    ).toBeNull();
  });
  it('신규·제거 재료의 차이를 구성·미분류 변화에 남긴다', () => {
    const now = snapshot('2026-10'),
      old = snapshot('2026-09');
    now.menus[0].ingredients.pop();
    const c = ingredientContributions(now, old, 'm');
    expect(c.priceEffect).toBe(0);
    expect(c.residual).toBe(-200);
  });
  it('가격 시뮬레이션은 실제 원가를 바꾸지 않고 0·음수·NaN을 차단한다', () => {
    const data = snapshot('2026-10'),
      original = structuredClone(data),
      cost = recipeCost(data, 'm');
    const s = simulatePrice(cost, 11000);
    expect(s.cost_rate).toBe(20);
    expect(s.margin_rate).toBe(80);
    expect(s.margin_amount).toBe(8800);
    expect(data).toEqual(original);
    for (const p of [0, -100, NaN, Infinity, null])
      expect(simulatePrice(cost, p).cost_rate).toBeNull();
  });
  it('원가가 판매가를 초과하면 음의 마진을 그대로 표시한다', () => {
    expect(simulatePrice(12000, 10000)).toEqual({
      cost_rate: 120,
      margin_rate: -20,
      margin_amount: -2000,
    });
  });
});
describe('재무 집계와 누락값', () => {
  const row = {
    month: '2026-10',
    net_sales: 1000000,
    food_cost: 350000,
    labor_cost: 300000,
    expenses: [{ id: 'rent', name: '임대료', amount: 150000 }],
    operating_expenses_complete: true,
  };
  it('매출·총 비용·영업손익의 회계식을 일치시킨다', () => {
    const m = financialMetrics(row);
    expect(m.totalCost).toBe(800000);
    expect(m.operatingProfit).toBe(200000);
    expect(m.grossProfit).toBe(650000);
    expect(m.foodRate).toBe(35);
  });
  it('운영비가 미완료이면 매출총이익까지만 계산한다', () => {
    const m = financialMetrics({ ...row, operating_expenses_complete: false });
    expect(m.other).toBeNull();
    expect(m.totalCost).toBeNull();
    expect(m.operatingProfit).toBeNull();
    expect(m.grossProfit).toBe(650000);
  });
  it('누락 항목을 0원으로 바꾸지 않고 명시적인 0원은 유지한다', () => {
    expect(financialMetrics({ ...row, food_cost: null }).operatingProfit).toBeNull();
    expect(
      financialMetrics({ ...row, expenses: [{ id: 'x', name: '비용', amount: null }] }).other,
    ).toBeNull();
    expect(
      financialMetrics({ ...row, expenses: [{ id: 'x', name: '비용', amount: 0 }] }).other,
    ).toBe(0);
    expect(financialMetrics(undefined).sales).toBeNull();
  });
  it('전월 0원은 증감률을 만들지 않고 적자에서 개선되는 방향을 유지한다', () => {
    expect(growth(100, 0)).toBeNull();
    expect(growth(100, null)).toBeNull();
    expect(growth(-50, -100)).toBe(50);
    expect(growth(-150, -100)).toBe(-50);
    expect(growth(0, 100)).toBe(-100);
    expect(ratio(100, 0)).toBeNull();
  });
  it('비용이 매출을 넘으면 음의 영업손익과 100% 초과 비율을 유지한다', () => {
    const m = financialMetrics({ ...row, food_cost: 1200000 });
    expect(m.operatingProfit).toBe(-650000);
    expect(m.foodRate).toBe(120);
  });
});
describe('사업장·기간·분석 문장 동기화', () => {
  it('사업장별로 분리되고 같은 월의 예시가 다음 달 조회에서도 바뀌지 않는다', () => {
    const a = createAnalysisDemo('store-a', '2026-10'),
      b = createAnalysisDemo('store-b', '2026-10'),
      next = createAnalysisDemo('store-a', '2026-11');
    expect(a.workspace_id).not.toBe(b.workspace_id);
    expect(a.financials.at(-1)?.net_sales).not.toBe(b.financials.at(-1)?.net_sales);
    expect(a.financials.at(-1)).toEqual(next.financials.find((r) => r.month === '2026-10'));
  });
  it('모든 예시 월의 원가·마진·기여도 합계와 재무 합계를 검증한다', () => {
    const d = createAnalysisDemo('store-a', '2026-10');
    for (const r of d.financials) {
      const m = financialMetrics(r);
      expect(m.sales! - m.totalCost!).toBe(m.operatingProfit);
      expect(m.food! + m.labor! + m.other!).toBe(m.totalCost);
    }
    for (const c of d.costs.slice(1)) {
      const old = d.costs.find((r) => r.month === shiftMonth(c.month, -1));
      for (const menu of c.menus) {
        const result = compareMenu(c, old, menu.id),
          effects = ingredientContributions(c, old, menu.id);
        expect(effects.priceEffect + effects.residual!).toBe(result.change);
        const sim = simulatePrice(result.currentCost, menu.selling_price);
        expect(sim.cost_rate! + sim.margin_rate!).toBeCloseTo(100);
      }
    }
  });
  it('차트 기간과 AI 근거 값이 선택 월을 따른다', () => {
    const d = createAnalysisDemo('store-a', '2026-10');
    expect(financialSeries(d, '2026-09', 3).map((r) => r.month)).toEqual([
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
    const f = demoFinancialInsight(d, '2026-09');
    expect(f.month).toBe('2026-09');
    expect(f.workspace_id).toBe(d.workspace_id);
    expect(f.summary).toContain('2026년 9월');
    expect(f.origin).toBe('demo-rule');
    const c = demoCostInsight(d, '2026-09', 'demo-pork-bowl');
    expect(c.summary).toContain(
      String(
        compareMenu(
          d.costs.find((r) => r.month === '2026-09'),
          d.costs.find((r) => r.month === '2026-08'),
          'demo-pork-bowl',
        ).change,
      ),
    );
  });
  it('기록 없는 월의 차트를 빈값으로 반환한다', () => {
    const d = createAnalysisDemo('a', '2026-10');
    expect(
      financialSeries({ ...d, financials: [] }, '2026-10', 3).every(
        (r) => r.sales === null && r.totalCost === null,
      ),
    ).toBe(true);
  });
});
