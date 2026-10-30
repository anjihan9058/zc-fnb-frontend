import {
  financialMetrics,
  growth,
  compareMenu,
  ingredientContributions,
  monthLabel,
  recipeCost,
  shiftMonth,
  type AnalysisDataset,
  type AnalysisInsight,
  type AnalysisRecipe,
} from '../shared/analytics';
import { won } from '../shared/format';

const ingredients = [
  { id: 'pork', name: '돼지고기', unit: 'kg', base: 9800 },
  { id: 'rice', name: '쌀', unit: 'kg', base: 2800 },
  { id: 'onion', name: '양파', unit: 'kg', base: 2200 },
  { id: 'greens', name: '채소류', unit: 'kg', base: 4200 },
  { id: 'oil', name: '식용유', unit: 'L', base: 4300 },
];
const recipes: AnalysisRecipe[] = [
  {
    id: 'demo-pork-bowl',
    name: '돼지고기 덮밥',
    selling_price: 10500,
    ingredients: [
      { ingredient_id: 'pork', quantity: 0.18 },
      { ingredient_id: 'rice', quantity: 0.1 },
      { ingredient_id: 'onion', quantity: 0.08 },
      { ingredient_id: 'oil', quantity: 0.015 },
    ],
  },
  {
    id: 'demo-fried-rice',
    name: '채소 볶음밥',
    selling_price: 8500,
    ingredients: [
      { ingredient_id: 'rice', quantity: 0.12 },
      { ingredient_id: 'greens', quantity: 0.16 },
      { ingredient_id: 'onion', quantity: 0.06 },
      { ingredient_id: 'oil', quantity: 0.025 },
    ],
  },
  {
    id: 'demo-pork-plate',
    name: '돼지고기 정식',
    selling_price: 14000,
    ingredients: [
      { ingredient_id: 'pork', quantity: 0.25 },
      { ingredient_id: 'rice', quantity: 0.1 },
      { ingredient_id: 'greens', quantity: 0.15 },
      { ingredient_id: 'oil', quantity: 0.015 },
    ],
  },
  {
    id: 'demo-salad',
    name: '채소 샐러드',
    selling_price: 7500,
    ingredients: [
      { ingredient_id: 'greens', quantity: 0.32 },
      { ingredient_id: 'onion', quantity: 0.03 },
      { ingredient_id: 'oil', quantity: 0.02 },
    ],
  },
];
export function createAnalysisDemo(workspaceId: string, endMonth: string): AnalysisDataset {
  // Stable by workspace and month. No random values, writes, or network calls.
  const seed = [...workspaceId].reduce((n, c) => n + c.charCodeAt(0), 0) % 13,
    scale = 1 + seed * 0.025;
  const costs = Array.from({ length: 25 }, (_, i) => {
    const month = shiftMonth(endMonth, i - 24),
      [y, m] = month.split('-').map(Number),
      step = (y - 2025) * 12 + m;
    return {
      month,
      ingredients: ingredients.map((item, index) => ({
        ...item,
        unit_price: Math.round(
          item.base *
            (1 + step * 0.006 + Math.sin(m * 0.8 + index) * 0.035 + (index === 0 ? m * 0.004 : 0)) *
            scale,
        ),
      })),
      menus: structuredClone(recipes),
    };
  });
  const financials = costs.map((snapshot) => {
    const m = Number(snapshot.month.slice(5)),
      step = (Number(snapshot.month.slice(0, 4)) - 2025) * 12 + m,
      quantities = [480, 350, 300, 200].map((n, k) =>
        Math.round(n * (1 + step * 0.014 + Math.sin(m * 0.6 + k) * 0.035) * scale),
      );
    const net_sales = snapshot.menus.reduce(
      (n, menu, k) => n + menu.selling_price! * quantities[k],
      0,
    );
    const food_cost =
      snapshot.menus.reduce((n, menu, k) => n + recipeCost(snapshot, menu.id)! * quantities[k], 0) +
      Math.round(180000 * scale);
    return {
      month: snapshot.month,
      net_sales,
      food_cost,
      labor_cost: Math.round((4200000 + step * 42000 + Math.cos(m) * 65000) * scale),
      expenses: [
        { id: 'rent', name: '임대료', amount: Math.round(1500000 * scale) },
        {
          id: 'utilities',
          name: '공과금',
          amount: Math.round((430000 + Math.abs(Math.sin(m)) * 85000) * scale),
        },
        { id: 'fees', name: '결제·운영 수수료', amount: Math.round(net_sales * 0.028) },
      ],
      operating_expenses_complete: true,
    };
  });
  return {
    schema_version: 1,
    workspace_id: workspaceId,
    currency: 'KRW',
    timezone: 'Asia/Seoul',
    source: 'demo',
    generated_at: `${endMonth}-01T00:00:00+09:00`,
    costs,
    financials,
  };
}
const pct = (n: number | null) =>
  n == null ? '비교 불가' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
export function demoFinancialInsight(data: AnalysisDataset, month: string): AnalysisInsight {
  const now = financialMetrics(data.financials.find((r) => r.month === month)),
    prev = financialMetrics(data.financials.find((r) => r.month === shiftMonth(month, -1)));
  const salesGrowth = growth(now.sales, prev.sales),
    foodGrowth = growth(now.food, prev.food);
  const current = data.costs.find((c) => c.month === month),
    previous = data.costs.find((c) => c.month === shiftMonth(month, -1));
  const changes = (current?.ingredients ?? [])
    .map((i) => ({
      name: i.name,
      value: growth(
        i.unit_price,
        previous?.ingredients.find((p) => p.id === i.id)?.unit_price ?? null,
      ),
    }))
    .filter((i) => i.value != null)
    .sort((a, b) => b.value! - a.value!);
  const price = changes[0];
  const costChanges = [
    { name: '식재료비', value: now.food, old: prev.food },
    { name: '인건비', value: now.labor, old: prev.labor },
    { name: '기타 운영비', value: now.other, old: prev.other },
  ]
    .filter((r) => r.value != null && r.old != null)
    .map((r) => ({ ...r, delta: r.value! - r.old! }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const driver = costChanges[0];
  const extra = ` 인건비는 전월 대비 ${pct(growth(now.labor, prev.labor))}, 기타 운영비는 ${pct(growth(now.other, prev.other))}입니다.${driver ? ` 비용 금액 변화가 가장 큰 항목은 ${driver.name}(${driver.delta > 0 ? '+' : ''}${won(driver.delta)})입니다.` : ''} ${now.operatingProfit != null ? `계산된 예시 영업손익은 ${won(now.operatingProfit)}입니다.` : '운영비 자료가 완성되지 않아 영업손익 계산은 보류합니다.'}`;

  return {
    workspace_id: data.workspace_id,
    month,
    origin: 'demo-rule',
    title: 'AI 종합 분석 · 재무 변화 요약',
    summary:
      now.sales == null
        ? '이 기간의 매출 자료가 없어 수익성 변화를 비교할 수 없습니다.'
        : `${monthLabel(month)} 순매출은 전월 대비 ${pct(salesGrowth)}, 식재료비는 ${pct(foodGrowth)}입니다. ${salesGrowth != null && foodGrowth != null ? (foodGrowth > salesGrowth ? '식재료비의 증가율이 매출 증가율보다 높게 나타났습니다.' : '식재료비의 증가율은 매출 증가율 이하입니다.') : ''} ${price ? `같은 기간 ${price.name}의 가상 매입 단가 변화는 ${pct(price.value)}로 관찰됩니다.` : ''}${extra}`,
    evidence: [
      { label: '당월 순매출 / 전월', value: `${won(now.sales)} / ${won(prev.sales)}` },
      {
        label: '식재료비 / 순매출',
        value: now.foodRate == null ? '계산 불가' : `${now.foodRate.toFixed(1)}%`,
      },
      { label: '인건비', value: won(now.labor) },
      { label: '기타 운영비', value: won(now.other) },
      {
        label: '예시 영업손익',
        value: now.operatingProfit == null ? '계산 보류' : won(now.operatingProfit),
      },
    ],
    limitations: [
      '이 카드는 가상 데이터를 규칙으로 설명한 AI 응답 예시이며 실제 AI를 호출하지 않습니다.',
      '단가 변동과 비용 변동의 동반 관찰이며, 판매량·메뉴 구성·폐기 요인 전체를 분해한 인과 분석은 아닙니다.',
      '당월을 포함한 모든 금액은 월간 예시이며 실제 마감·정산 수치가 아닙니다.',
    ],
  };
}
export function demoCostInsight(
  data: AnalysisDataset,
  month: string,
  menuId: string,
): AnalysisInsight {
  const current = data.costs.find((c) => c.month === month),
    previous = data.costs.find((c) => c.month === shiftMonth(month, -1)),
    comparison = compareMenu(current, previous, menuId),
    contributions = ingredientContributions(current, previous, menuId),
    top = contributions.rows.find((r) => (r.effect ?? 0) > 0);
  return {
    workspace_id: data.workspace_id,
    month,
    origin: 'demo-rule',
    title: `AI 원가 분석 · ${comparison.menu?.name ?? '메뉴'} 원가 변화`,
    summary:
      comparison.change == null
        ? '전월 또는 당월 레시피·단가가 누락되어 변화 분석을 보류합니다.'
        : `전월 대비 1인분 식재료 원가는 ${comparison.change >= 0 ? '+' : ''}${won(comparison.change)} 변했습니다. ${top ? `상승 단가 효과가 가장 큰 재료는 ${top.name}이며, 당월 사용량 기준 ${won(top.effect)}입니다.` : '확인 가능한 재료 중 양의 단가 상승 효과가 없습니다.'}`,
    evidence: [
      {
        label: '전월 / 당월 원가',
        value: `${won(comparison.previousCost)} / ${won(comparison.currentCost)}`,
      },
      {
        label: '원가율 변화',
        value:
          comparison.rateChange == null
            ? '비교 불가'
            : `${comparison.rateChange >= 0 ? '+' : ''}${comparison.rateChange.toFixed(2)}%p`,
      },
      { label: '구성·미분류 변화', value: won(contributions.residual) },
    ],
    limitations: [
      '현재 사업장의 실제 레시피·구매 기록과 분리된 가상 메뉴 예시입니다.',
      '단가 효과 = 당월 사용량에 당월·전월 단가를 각각 적용한 금액 차이입니다. 원가율 차이는 판매가 변화도 반영합니다.',
      '기여도 비중은 양의 단가 상승 효과 합계 기준이며, 인하 효과와 구성 변화는 별도로 표시합니다.',
    ],
  };
}
