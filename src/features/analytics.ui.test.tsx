// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FinancialAnalysis } from './FinancialAnalysis';
import { MenuCostAnalysis } from './MenuCostAnalysis';
import { useAnalysisPreview } from '../app/useAnalysisPreview';
import { createAnalysisDemo } from '../mocks/analytics';
import { recipeCost } from '../shared/analytics';
const workspace = vi.hoisted(() => ({
  id: 'store-a',
  name: '테스트 가게',
  room_id: 'room',
  address: '',
}));
vi.mock('../app/WorkspaceProvider', () => ({ useWorkspace: () => workspace }));
vi.mock('../shared/api', () => ({ isDemo: true }));
// Domain and UI wiring tests inspect the chart data; the production renderer remains Recharts.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children, data }: { children: React.ReactNode; data: unknown }) => (
    <div data-chart="line" data-values={JSON.stringify(data)}>
      {children}
    </div>
  ),
  ComposedChart: ({ children, data }: { children: React.ReactNode; data: unknown }) => (
    <div data-chart="composed" data-values={JSON.stringify(data)}>
      {children}
    </div>
  ),
  BarChart: ({ children, data }: { children: React.ReactNode; data: unknown }) => (
    <div data-chart="bar" data-values={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Bar: () => null,
  Cell: () => null,
  CartesianGrid: () => null,
  Legend: () => null,
  Line: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));
function FinancialHarness() {
  return <FinancialAnalysis model={useAnalysisPreview()} />;
}
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-29T12:00:00+09:00'));
  workspace.id = 'store-a';
  workspace.name = '테스트 가게';
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function choose(label: string, value: string) {
  const input = host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
  await act(async () => {
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function fill(value: string) {
  const input = host.querySelector<HTMLInputElement>('input[aria-label="가정 판매가격"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function enter(label: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function applyFinancialInput() {
  await act(async () => {
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}
const financePoints = () =>
  JSON.parse(host.querySelector('[data-chart=composed]')!.getAttribute('data-values')!);
it('운영비 항목 추가·삭제를 반영하고 저장 실패 시 기존 재무 수치를 유지한다', async () => {
  await act(async () => root.render(<FinancialHarness />));
  const before = financePoints().at(-1);
  const add = Array.from(host.querySelectorAll('button')).find((b) =>
    b.textContent?.includes('운영비 추가'),
  )!;
  await act(async () => add.click());
  await enter('운영비 4 항목', '보험료');
  await enter('운영비 4 금액', '100000');
  await act(async () =>
    host.querySelector<HTMLButtonElement>('button[aria-label="운영비 2 삭제"]')!.click(),
  );
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Full', 'QuotaExceededError');
  });
  await applyFinancialInput();
  expect(host.querySelector('[role=alert]')?.textContent).toContain('저장에 실패');
  expect(financePoints().at(-1)).toEqual(before);
  setItem.mockRestore();
  await applyFinancialInput();
  const original = createAnalysisDemo(workspace.id, '2026-10').financials.at(-1)!;
  expect(financePoints().at(-1).other).toBe(before.other - original.expenses[1].amount! + 100000);
});
it('매출·비용 입력을 적용하면 손익·차트·AI 근거가 같아지고 재접속·사업장·월별로 보존된다', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  await act(async () => root.render(<FinancialHarness />));
  await enter('총매출 입력', '10000000');
  await enter('식재료비 입력', '3000000');
  await enter('인건비 입력', '2000000');
  for (let i = 1; i <= 3; i++) await enter(`운영비 ${i} 금액`, i === 1 ? '1000000' : '0');
  expect(host.querySelector('.financial-input-preview')?.textContent).toContain('4,000,000원');
  await applyFinancialInput();
  expect(financePoints().at(-1)).toMatchObject({
    sales: 10000000,
    food: 3000000,
    labor: 2000000,
    other: 1000000,
    operatingProfit: 4000000,
  });
  expect(host.querySelectorAll('.analysis-kpis strong')[3].textContent).toBe('4,000,000원');
  expect(host.querySelector('.analysis-evidence')?.textContent).toContain('4,000,000원');
  expect(host.querySelector('.analysis-ai-summary')?.textContent).not.toContain('가상 매입 단가');
  await choose('분석 기준 월', '2026-09');
  expect(financePoints().at(-1).sales).not.toBe(10000000);
  await choose('분석 기준 월', '2026-10');
  expect(financePoints().at(-1).sales).toBe(10000000);
  workspace.id = 'store-b';
  await act(async () => root.render(<FinancialHarness />));
  expect(financePoints().at(-1).sales).not.toBe(10000000);
  workspace.id = 'store-a';
  await act(async () => {
    root.render(<div />);
  });
  await act(async () => root.render(<FinancialHarness />));
  expect(financePoints().at(-1).sales).toBe(10000000);
  expect(fetchSpy).not.toHaveBeenCalled();
});
it('미입력·0원·음수와 운영비 완료 여부를 구분하고 잘못된 입력은 저장하지 않는다', async () => {
  await act(async () => root.render(<FinancialHarness />));
  const before = financePoints().at(-1).sales;
  await enter('총매출 입력', '-1');
  await applyFinancialInput();
  expect(host.querySelector('[role=alert]')?.textContent).toContain('0 이상');
  expect(financePoints().at(-1).sales).toBe(before);
  await enter('총매출 입력', '0');
  await enter('인건비 입력', '');
  await applyFinancialInput();
  expect(financePoints().at(-1)).toMatchObject({ sales: 0, labor: null, operatingProfit: null });
  expect(host.querySelectorAll('.analysis-kpis strong')[2].textContent).toBe('—');
  await enter('인건비 입력', '0');
  await act(async () => host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
  await applyFinancialInput();
  expect(financePoints().at(-1)).toMatchObject({ labor: 0, other: null, operatingProfit: null });
});
it('선택 월만 초기화하며 전월 수정값이 비교와 다른 탭에 함께 반영된다', async () => {
  await act(async () => root.render(<FinancialHarness />));
  await choose('분석 기준 월', '2026-09');
  await enter('총매출 입력', '1000000');
  await applyFinancialInput();
  await choose('분석 기준 월', '2026-10');
  await enter('총매출 입력', '2000000');
  await applyFinancialInput();
  expect(host.querySelector('.analysis-kpis .analysis-delta')?.textContent).toContain('100.0%');
  const reset = Array.from(host.querySelectorAll('button')).find((b) =>
    b.textContent?.includes('이 달 기본값으로 복원'),
  )!;
  await act(async () => reset.click());
  expect(financePoints().at(-1).sales).toBe(
    createAnalysisDemo(workspace.id, '2026-10').financials.at(-1)?.net_sales,
  );
  await choose('분석 기준 월', '2026-09');
  expect(financePoints().at(-1).sales).toBe(1000000);
  await act(async () => {
    const storageKey = `zc-fnb:financial-inputs:v1:${workspace.id}`;
    const entries = JSON.parse(localStorage.getItem(storageKey)!);
    entries['2026-09'].net_sales = 1500000;
    localStorage.setItem(storageKey, JSON.stringify(entries));
    window.dispatchEvent(new StorageEvent('storage', { key: storageKey }));
  });
  expect(financePoints().at(-1).sales).toBe(1500000);
});
it('재무의 기준월·차트 기간·사업장·AI 근거가 함께 바뀐다', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  await act(async () => root.render(<FinancialHarness />));
  expect(host.textContent).toContain('가상 데이터 · AI 응답 예시');
  expect(host.querySelectorAll('.analysis-kpis article')).toHaveLength(4);
  await choose('분석 기준 월', '2026-09');
  expect(host.querySelector('.analysis-ai-summary')?.textContent).toContain('2026년 9월');
  let points = JSON.parse(
    host.querySelector('[data-chart=composed]')!.getAttribute('data-values')!,
  );
  expect(points.at(-1).month).toBe('2026-09');
  await choose('재무 차트 기간', '12');
  points = JSON.parse(host.querySelector('[data-chart=composed]')!.getAttribute('data-values')!);
  expect(points).toHaveLength(12);
  const before = host.querySelector('.analysis-kpis strong')?.textContent;
  workspace.id = 'store-b';
  workspace.name = '다른 사업장';
  await act(async () => root.render(<FinancialHarness />));
  expect(host.querySelector('input[readonly]')?.getAttribute('value')).toBe('다른 사업장');
  expect(host.querySelector('.analysis-kpis strong')?.textContent).not.toBe(before);
  expect((host.querySelector('select[aria-label="분석 기준 월"]') as HTMLSelectElement).value).toBe(
    '2026-10',
  );
  expect(fetchSpy).not.toHaveBeenCalled();
});
it('재무 자료 미연결 상태에서 가상 차트와 AI 결론을 유지하지 않는다', async () => {
  await act(async () => root.render(<FinancialHarness />));
  await choose('분석 데이터 보기', 'missing');
  expect(host.querySelectorAll('[data-chart]')).toHaveLength(0);
  expect(host.textContent).toContain('분석 근거가 없어');
  expect(host.querySelectorAll('.analysis-kpis strong')[0].textContent).toBe('—');
  expect(host.querySelector('.analysis-ai-summary')).toBeNull();
});
it('가격 시뮬레이션은 계산만 갱신하고 선택 월·메뉴가 바뀌면 초기화한다', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  await act(async () => root.render(<MenuCostAnalysis />));
  const data = createAnalysisDemo('store-a', '2026-10'),
    cost = recipeCost(data.costs.at(-1), 'demo-pork-bowl')!;
  await fill('12000');
  expect(host.querySelector('.analysis-simulation-results strong')?.textContent).toBe(
    `${((cost / 12000) * 100).toFixed(1)}%`,
  );
  expect(host.querySelector('.analysis-table tbody tr')?.textContent).toContain('돼지고기 덮밥');
  await fill('0');
  expect(host.querySelector('[role=alert]')?.textContent).toContain('0보다 큰');
  expect(host.querySelector('.analysis-simulation-results strong')?.textContent).toBe('—');
  await choose('상세 분석 메뉴', 'demo-salad');
  expect((host.querySelector('input[aria-label="가정 판매가격"]') as HTMLInputElement).value).toBe(
    '7500',
  );
  expect(host.querySelector('.analysis-ai-summary')?.textContent).not.toContain('undefined');
  await fill('9000');
  await choose('분석 기준 월', '2026-09');
  expect((host.querySelector('input[aria-label="가정 판매가격"]') as HTMLInputElement).value).toBe(
    '7500',
  );
  expect(fetchSpy).not.toHaveBeenCalled();
});
