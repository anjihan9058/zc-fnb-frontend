import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { httpApi } from './api';

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('실제 HTTP 어댑터 계약', () => {
  it('업로드는 multipart 필드와 쿠키를 사용한다', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ receipt_id: 'new-id', status: 'UPLOADED' }), { status: 202 }),
    );
    await httpApi.upload(
      new File(['sample'], 'receipt.png', { type: 'image/png' }),
      'room-1',
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/receipts');
    expect(init.credentials).toBe('include');
    expect(init.body.get('room_id')).toBe('room-1');
    expect(init.body.has('upload_mode')).toBe(false);
    expect(init.body.has('receipt_format')).toBe(false);
    expect(init.body.has('document_type')).toBe(false);
    expect(init.headers['Content-Type']).toBeUndefined();
  });
  it('승인 요청은 버전과 동일 멱등 키를 전달하고 자동 반복하지 않는다', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await httpApi.approve('r/1', 3, 'idempotent-key');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/receipts/r%2F1/approve');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      version: 3,
      idempotency_key: 'idempotent-key',
    });
  });
  it.each([
    [401, '로그인이 만료'],
    [403, '접근할 권한'],
    [409, '중복 요청'],
  ])('%i 오류는 행동 가능한 안내를 제공한다', async (status, text) => {
    fetchMock.mockResolvedValue(new Response('{}', { status: Number(status) }));
    await expect(httpApi.receipt('r')).rejects.toThrow(String(text));
  });
  it('파일 부가정보가 없는 인수인계 초안 응답도 안전하게 표시한다', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          receipt_id: 'r',
          status: 'NEEDS_REVIEW',
          items: [],
          version: 2,
          image_url: null,
        }),
      ),
    );
    const r = await httpApi.receipt('r');
    expect(r.file_name).toBe('영수증 r');
    expect(r.created_at).toBe('');
    expect(r.image_url).toBeNull();
  });
  it('오프라인 쓰기는 전송도, 자동 큐 등록도 하지 않는다', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    await expect(httpApi.approve('r', 1, 'key')).rejects.toThrow('오프라인');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
