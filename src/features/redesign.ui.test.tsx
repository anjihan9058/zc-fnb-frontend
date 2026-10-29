// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { transferableAbortController } from 'node:util';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { UploadDialog } from './UploadDialog';
import { ReceiptLibrary } from './ReceiptLibrary';
import { api } from '../shared/api';
import { ToastProvider } from '../shared/ui';

vi.mock('../app/WorkspaceProvider', () => ({
  useWorkspace: () => ({ id: 'qa', room_id: 'room', name: '검증 사업장' }),
}));
vi.mock('../shared/api', () => ({
  isDemo: false,
  api: { upload: vi.fn(), sample: vi.fn(), summary: vi.fn() },
  validateFile: vi.fn(),
}));
let root: Root, host: HTMLDivElement, client: QueryClient;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('AbortController', transferableAbortController().constructor);
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value() {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value() {
      this.removeAttribute('open');
    },
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
async function render(element: React.ReactNode, path = '/') {
  const router = createMemoryRouter(
    [
      { path: '*', element },
      { path: '/receipts/:id', element: <p>문서 상세</p> },
    ],
    { initialEntries: [path] },
  );
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
  return router;
}
it('영수증은 유형 선택 없이 PDF를 바로 첨부하고 전송한다', async () => {
  const close = vi.fn();
  vi.mocked(api.upload).mockResolvedValue({ receipt_id: 'r' } as Awaited<
    ReturnType<typeof api.upload>
  >);
  await render(<UploadDialog room="room" close={close} />);
  expect(host.textContent).not.toContain('영수증 형식');
  expect(host.textContent).not.toContain('형식 변경');
  const input = host.querySelector('input[type=file]') as HTMLInputElement;
  const file = new File(['synthetic pdf'], 'qa.pdf', { type: 'application/pdf' });
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(host.textContent).toContain('qa.pdf');
  const send = [...host.querySelectorAll('button')].find((b) => b.textContent === '영수증 전송')!;
  expect(send.disabled).toBe(false);
  await act(async () => send.click());
  expect(api.upload).toHaveBeenCalledWith(file, 'room');
  expect(close).toHaveBeenCalledOnce();
});
it('홈의 검토 필터로 들어와 문서를 연 뒤 목록으로 돌아오면 검색 조건이 유지된다', async () => {
  const base = {
    room_id: 'room',
    input_style: 'PRINTED' as const,
    has_price: false,
    image_url: null,
    version: 1,
    created_at: '2026-10-28',
    file_name: 'test.png',
    file_type: 'image/png',
    document_kind: 'RECEIPT' as const,
    supplier: { id: 's', name: '테스트 거래처' },
    purchased_at: '2026-10-28',
    items: [],
  };
  vi.mocked(api.summary).mockResolvedValue({
    processing: 0,
    review: 1,
    approved: 1,
    total: 3,
    recent: [
      { ...base, receipt_id: 'r1', status: 'NEEDS_REVIEW' },
      { ...base, receipt_id: 'r2', status: 'READY_TO_APPROVE' },
      { ...base, receipt_id: 'r3', status: 'APPROVED' },
    ],
  } as Awaited<ReturnType<typeof api.summary>>);
  const router = await render(<ReceiptLibrary />, '/receipts?status=REVIEW&q=테스트');
  for (let n = 0; n < 30 && !host.querySelector('a.document-name'); n++)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  const links = [...host.querySelectorAll<HTMLAnchorElement>('a.document-name')];
  expect(links).toHaveLength(2);
  await act(async () => links[0].click());
  expect(router.state.location.pathname).toBe('/receipts/r1');
  expect(router.state.location.state.returnTo).toContain('status=REVIEW');
  await act(async () => {
    await router.navigate(-1);
  });
  expect((host.querySelector('input[aria-label="영수증 검색"]') as HTMLInputElement).value).toBe(
    '테스트',
  );
  expect(host.querySelectorAll('a.document-name')).toHaveLength(2);
});
