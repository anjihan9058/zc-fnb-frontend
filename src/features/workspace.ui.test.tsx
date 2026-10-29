// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WorkspaceGrid } from './WorkspaceGrid';
import { BankingPage } from '../pages/BankingPage';

let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function click(element: Element | undefined | null) {
  if (!element) throw new Error('Control not found');
  await act(async () => (element as HTMLElement).click());
}
function button(name: string) {
  return [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);
}
async function fill(value: string) {
  const input = host.querySelector<HTMLInputElement>('input[aria-label="표 검색"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it('공통 표에서 검색·정렬·페이지 이동·열 표시를 함께 사용할 수 있다', async () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    id: String(i),
    name: `식재료 ${String(i).padStart(2, '0')}`,
    amount: i,
  }));
  await act(async () =>
    root.render(
      <WorkspaceGrid
        rows={rows}
        columns={[
          {
            key: 'name',
            label: '이름',
            render: (r) => r.name,
            sort: (a, b) => a.name.localeCompare(b.name),
          },
          { key: 'amount', label: '금액', render: (r) => r.amount },
        ]}
        getId={(r) => r.id}
        searchText={(r) => r.name}
      />,
    ),
  );
  expect(host.querySelectorAll('tbody tr')).toHaveLength(10);
  await click(host.querySelector('[aria-label="다음 페이지"]'));
  expect(host.querySelectorAll('tbody tr')).toHaveLength(2);
  await fill('식재료 01');
  expect(host.querySelectorAll('tbody tr')).toHaveLength(1);
  expect(host.querySelector('.grid-pagination')?.textContent).toContain('1–1 / 1건');
  await fill('');
  await click(button('이름'));
  await click(button('이름'));
  expect(host.querySelector('tbody tr')?.textContent).toContain('식재료 11');
  await click(host.querySelector('.grid-tool'));
  await click(host.querySelectorAll('.grid-column-menu input')[1]);
  expect(host.querySelectorAll('th')).toHaveLength(1);
  expect((host.querySelector('.grid-column-menu input') as HTMLInputElement).disabled).toBe(true);
  await fill('없는 항목');
  expect(host.textContent).toContain('검색어를 바꿔');
});

it('은행 자료는 사용자가 샘플을 선택한 뒤에만 표시한다', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  try {
    await act(async () => root.render(<BankingPage />));
    expect(host.querySelectorAll('tbody tr')).toHaveLength(0);
    await click(button('샘플 거래로 화면 보기'));
    expect(host.querySelectorAll('tbody tr')).toHaveLength(4);
    expect(host.textContent).toContain('실제 계좌와 연결되지 않습니다');
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally {
    fetchSpy.mockRestore();
  }
});

it('은행 후보의 차액을 확인하고 검토 단계를 거쳐 연결·해제한다', async () => {
  await act(async () => root.render(<BankingPage />));
  await click(button('샘플 거래로 화면 보기'));
  await click(host.querySelector('.grid-row-link'));
  const radios = host.querySelectorAll<HTMLInputElement>('input[type=radio]');
  await click(radios[1]);
  expect(button('연결 검토')?.disabled).toBe(true);
  await click(radios[0]);
  expect(button('연결 검토')?.disabled).toBe(false);
  await click(button('연결 검토'));
  expect(host.textContent).toContain('실제 지급·장부에는 반영하지 않습니다');
  await click(button('샘플 연결 확정'));
  expect(host.querySelector('.record-sidesheet')?.textContent).toContain('샘플 지급 기록에 연결됨');
  await click(button('연결 해제'));
  expect(host.querySelector('.record-sidesheet')?.textContent).toContain('지급 기록 후보');
});
