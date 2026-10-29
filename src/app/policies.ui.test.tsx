// @vitest-environment jsdom
import { act, useState, type ReactNode } from 'react';
import { transferableAbortController } from 'node:util';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, Link, RouterProvider, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionGate } from './SessionGate';
import { NavigationGuard } from './NavigationGuard';
import { ReceiptReviewPage } from '../pages/ReceiptPage';
import { ProductsPage } from '../pages/ProductsPage';
import { Modal, ToastProvider } from '../shared/ui';
import { authApi, api } from '../shared/api';
import { ApiError } from '../shared/errors';
import type { Receipt } from '../shared/types';

vi.mock('../shared/api', () => ({ isDemo: false, authApi: { session: vi.fn(), login: vi.fn() }, api: { receipt: vi.fn(), products: vi.fn(), patchItem: vi.fn(), saveProduct: vi.fn() } }));
const user = { id: 'qa-user', display_name: 'QA 사용자' };
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
let receipt: Receipt;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  // React Router uses Node's Request in jsdom; its signal must come from the same realm.
  vi.stubGlobal('AbortController', transferableAbortController().constructor);
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open'); } });
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  receipt = { receipt_id: 'qa', room_id: 'room', version: 1, status: 'READY_TO_APPROVE', upload_mode: 'PRINTED', document_kind: 'RECEIPT', input_style: 'PRINTED', has_price: true, supplier: { id: 'supplier', name: 'QA 업체' }, purchased_at: '2026-10-27', created_at: '', image_url: null, file_name: 'QA 문서', file_type: 'image/png',
    items: [{ id: 'item', raw_name: '양파', normalized_name: '양파', product_id: 'onion', quantity: 2, unit: 'kg', unit_price: 1000, line_total: 2000, currency: 'KRW', status: 'READY_TO_APPROVE', warnings: [], comparison: null, evidence_bbox: null }] };
  vi.mocked(authApi.session).mockResolvedValue(user); vi.mocked(authApi.login).mockResolvedValue(user);
  vi.mocked(api.receipt).mockImplementation(async () => structuredClone(receipt));
  vi.mocked(api.products).mockResolvedValue([{ id: 'onion', name: '양파', unit: 'kg', aliases: [], category: '채소' }]);
  vi.mocked(api.saveProduct).mockResolvedValue(undefined);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

async function until(check: () => boolean) {
  for (let n = 0; n < 50; n++) { if (check()) return; await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); }); }
  throw new Error(`Expected UI state not reached: ${host.textContent}`);
}
async function click(element: Element | undefined | null) {
  if (!element) throw new Error('Control not found');
  await act(async () => (element as HTMLElement).click());
}
function button(name: string) { return [...host.querySelectorAll('button')].find((element) => element.textContent?.trim() === name); }
function field(name: string) {
  const label = [...host.querySelectorAll('label')].find((element) => element.textContent?.trim() === name);
  const input = label?.querySelector('input'); if (!input) throw new Error(`Field not found: ${name}`); return input;
}
async function fill(input: HTMLInputElement, value: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
}
async function mount(element: ReactNode, path = '/receipts/qa', auth = true) {
  const router = createMemoryRouter([{ path: '*', element: auth ? <SessionGate>{element}</SessionGate> : element }], { initialEntries: [path] });
  await act(async () => root.render(<QueryClientProvider client={client}><ToastProvider><RouterProvider router={router} /></ToastProvider></QueryClientProvider>));
  return router;
}

describe('인증 복귀와 입력 보존', () => {
  it('처음 로그인한 후 요청했던 상세 경로로 돌아간다', async () => {
    vi.mocked(authApi.session).mockResolvedValue(null);
    const router = await mount(<p>원래 상세 화면</p>, '/receipts/qa?view=review');
    await until(() => !!button('로그인'));
    expect(router.state.location.pathname).toBe('/login');
    expect(new URLSearchParams(router.state.location.search).get('returnTo')).toBe('/receipts/qa?view=review');
    await fill(field('이메일'), 'qa@example.test'); await fill(field('비밀번호'), 'qa-only-password'); await click(button('로그인'));
    await until(() => host.textContent?.includes('원래 상세 화면') ?? false);
    expect(router.state.location.pathname + router.state.location.search).toBe('/receipts/qa?view=review');
  });
  it('품목 편집 중 401이 발생해도 입력과 모달을 유지하고 재인증 후 이어간다', async () => {
    vi.mocked(api.patchItem).mockImplementationOnce(async () => { window.dispatchEvent(new Event('zcfnb:session-expired')); throw new ApiError('로그인 만료', 401); });
    await mount(<ReceiptReviewPage />);
    await until(() => host.querySelectorAll('button').length > 5);
    await click([...host.querySelectorAll('button')].filter((element) => element.textContent?.trim() === '수정')[1]);
    await fill(field('수량'), '5'); await click(button('수량 × 단가로 금액 입력')); await click(button('저장 및 재검증'));
    await until(() => host.textContent?.includes('다시 로그인해 주세요') ?? false);
    expect(field('수량').value).toBe('5'); expect(field('행 금액 (원)').value).toBe('5000');
    await fill(field('이메일'), 'qa@example.test'); await fill(field('비밀번호'), 'qa-only-password'); await click(button('로그인'));
    await until(() => !host.textContent?.includes('다시 로그인해 주세요'));
    expect(field('수량').value).toBe('5'); expect(host.querySelectorAll('dialog[open]')).toHaveLength(1);
  });
  it('422 필드 오류와 요청 번호를 표시하면서 수정 값을 유지한다', async () => {
    vi.mocked(api.patchItem).mockRejectedValue(new ApiError('입력 확인', 422, 'INVALID', 'qa-fields-422', { quantity: '실제 수량을 확인하세요.' }));
    await mount(<ReceiptReviewPage />);
    await until(() => host.querySelectorAll('button').length > 5);
    await click([...host.querySelectorAll('button')].filter((element) => element.textContent?.trim() === '수정')[1]);
    await fill(field('수량'), '5'); await click(button('수량 × 단가로 금액 입력')); await click(button('저장 및 재검증'));
    await until(() => host.textContent?.includes('qa-fields-422') ?? false);
    expect(field('수량').value).toBe('5'); expect(host.textContent).toContain('실제 수량을 확인하세요.');
  });
  it('없는 상세 항목에서는 목록으로 돌아갈 수 있다', async () => {
    vi.mocked(api.receipt).mockRejectedValue(new ApiError('요청한 항목이 없습니다.', 404));
    const router = await mount(<ReceiptReviewPage />);
    await until(() => host.textContent?.includes('영수증 목록으로 돌아가기') ?? false);
    const back = [...host.querySelectorAll('a')].find((link) => link.textContent === '영수증 목록으로 돌아가기');
    await click(back); expect(router.state.location.pathname).toBe('/receipts');
  });
});

function DraftPage({ busy = false }: { busy?: boolean }) {
  const [value, setValue] = useState(''); const navigate = useNavigate();
  return <><NavigationGuard /><input aria-label="초안" value={value} onChange={(e) => setValue(e.target.value)} /><div data-unsaved={!!value} data-pending={busy} /><Link to="/menus">메뉴로 이동</Link><button onClick={() => navigate(-1)}>뒤로 가기</button></>;
}
describe('작성 취소·화면 이동', () => {
  it('뒤로 가기와 링크 이동을 취소하면 초안이 남고, 승인하면 이동한다', async () => {
    const router = createMemoryRouter([{ path: '/edit', element: <DraftPage /> }, { path: '*', element: <p>다른 화면</p> }], { initialEntries: ['/dashboard', '/edit'] });
    await act(async () => root.render(<QueryClientProvider client={client}><ToastProvider><RouterProvider router={router} /></ToastProvider></QueryClientProvider>));
    const draft = host.querySelector('input')!; await fill(draft, '보관할 초안');
    const unloading = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unloading); expect(unloading.defaultPrevented).toBe(true);
    await click(button('뒤로 가기')); expect(router.state.location.pathname).toBe('/edit'); expect(draft.value).toBe('보관할 초안');
    await click(host.querySelector('a')); expect(router.state.location.pathname).toBe('/edit');
    vi.mocked(window.confirm).mockReturnValue(true); await click(host.querySelector('a'));
    expect(router.state.location.pathname).toBe('/menus');
  });
  it('저장 중인 화면에서는 이탈 확인 대신 이동을 막는다', async () => {
    const router = await mount(<DraftPage busy />, '/edit', false);
    await click(host.querySelector('a'));
    expect(router.state.location.pathname).toBe('/edit'); expect(window.confirm).not.toHaveBeenCalled();
    expect(host.textContent).toContain('저장·전송이 끝난 뒤 이동');
  });
  it('식재료 모달의 닫기·취소를 취소하면 입력이 유지된다', async () => {
    await mount(<ProductsPage />, '/products', false);
    await click(button('식재료 등록')); await fill(field('품목명'), 'QA 새 품목');
    await click(host.querySelector('button[aria-label="닫기"]')); expect(field('품목명').value).toBe('QA 새 품목');
    await click(button('취소')); expect(field('품목명').value).toBe('QA 새 품목');
    vi.mocked(window.confirm).mockReturnValue(true); await click(button('취소'));
    expect(host.querySelector('dialog')).toBeNull(); expect(api.saveProduct).not.toHaveBeenCalled();
  });
  it('중첩 모달은 각각 고유한 제목 연결을 가진다', async () => {
    await mount(<><Modal title="첫 모달" close={() => {}}>첫 내용</Modal><Modal title="두 번째 모달" close={() => {}}>두 번째 내용</Modal></>, '/', false);
    const ids = [...host.querySelectorAll('dialog')].map((dialog) => dialog.getAttribute('aria-labelledby'));
    expect(new Set(ids).size).toBe(2); expect(ids.every((id) => !!document.getElementById(id!))).toBe(true);
  });
});
