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
