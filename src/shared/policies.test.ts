import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { safeReturnTo } from './navigation';
import { ApiError, apiFailure } from './errors';
import { ErrorState } from './ui';
import { httpApi } from './api';

beforeEach(() => vi.stubGlobal('navigator', { onLine: true }));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('로그인 복귀 경로', () => {
  it.each(['/receipts/id-1', '/schedules/id-2?view=all#summary', '/rooms/team', '/menus?menu=one', '/accounting', '/banking', '/reports?view=profit', '/dashboard/financial'])('앱 경로 %s를 유지한다', (path) => expect(safeReturnTo(path)).toBe(path));
  it.each([null, '', 'https://other.test', '//other.test/rooms/team', '/\\other.test', '/login?returnTo=/menus', '/%6cogin', '/rooms/%2f%2fother.test', '/dashboard/../login', '/unknown', '/rooms/%00', '/rooms/%invalid'])('허용하지 않는 복귀 경로 %s는 대시보드로 제한한다', (path) => expect(safeReturnTo(path)).toBe('/dashboard'));
});

describe('오류와 결과 불명 요청', () => {
  it('422 필드 오류·요청 번호를 보존하고 HTML은 텍스트로 표시한다', () => {
    const error = apiFailure(422, { error: { code: 'INVALID', message: '입력 확인', fields: { quantity: ['수량 누락', '<img src=x onerror=alert(1)>'], ignored: { unsafe: true } } }, request_id: 'request-1' }, null, false, true);
    expect(error.fields.quantity).toContain('수량 누락'); expect(error.fields.ignored).toBeUndefined();
    const html = renderToStaticMarkup(createElement(ErrorState, { error }));
    expect(html).toContain('request-1'); expect(html).toContain('&lt;img'); expect(html).not.toContain('<img');
    expect(error.resultUnknown).toBe(false);
  });
  it('읽기와 쓰기의 500 오류를 구분하고 헤더의 추적 번호를 우선한다', () => {
    expect(apiFailure(500, {}, null, false, false).resultUnknown).toBe(false);
    const error = apiFailure(503, { request_id: 'body-id' }, 'header-id', false, true);
    expect(error.requestId).toBe('header-id'); expect(error.resultUnknown).toBe(true);
    expect(renderToStaticMarkup(createElement(ErrorState, { error }))).toContain('서버에 저장되었을 수 있습니다');
  });
  it.each([403, 404, 409, 429])('%i 오류에 정해진 복구 안내를 사용한다', (status) => {
    const error = apiFailure(status, { error: { message: 'untrusted server detail' } }, null, false, false);
    expect(error.status).toBe(status); expect(error.message).not.toBe('untrusted server detail');
  });
  it('통신 유실 시 쓰기 결과 불명을 표시하며 자동 재전송하지 않는다', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('network')); vi.stubGlobal('fetch', fetch);
    const failure = await httpApi.approve('receipt', 2, 'stable-key').catch((error) => error);
    expect(failure).toBeInstanceOf(ApiError); expect(failure.resultUnknown).toBe(true); expect(fetch).toHaveBeenCalledTimes(1);
    const readFailure = await httpApi.receipt('receipt').catch((error) => error);
    expect(readFailure.resultUnknown).toBe(false);
  });
  it('시간 초과의 쓰기도 결과 불명으로 구분한다', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))));
    const pending = httpApi.send('room', 'message').catch((error) => error);
    await vi.advanceTimersByTimeAsync(25001);
    const failure = await pending; expect(failure.code).toBe('TIMEOUT'); expect(failure.resultUnknown).toBe(true);
  });
});

describe('수정 요청의 필드 범위', () => {
  it('영수증 품목 수정에 승인 상태·소유자를 섞지 않는다', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal('fetch', fetch);
    const patch = { product_id: 'onion', quantity: 2, unit: 'kg', unit_price: 1000, line_total: 2000, status: 'APPROVED', owner_id: 'other' };
    await httpApi.patchItem('receipt', 'line', patch, 2);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.status).toBeUndefined(); expect(body.owner_id).toBeUndefined(); expect(body.version).toBe(2);
  });
  it('검수 수정은 실제 수량·비고만 보내고 원본·승인 상태는 제외한다', async () => {
    vi.stubEnv('VITE_API_MODE', 'http'); vi.resetModules();
    const { operationsApi } = await import('./api');
    const fetch = vi.fn().mockResolvedValue(new Response('{}')); vi.stubGlobal('fetch', fetch);
    await operationsApi.saveReceiving({ receipt_id: 'r', version: 3, supplier: '원본 업체', received_on: '2026-10-27', receipt_status: 'APPROVED', status: 'COMPLETED', checked_by: 'QA', checked_at: 'fake-time', completed: true,
      lines: [{ item_id: 'line', name: '원본 품목', unit: 'kg', expected_quantity: 20, actual_quantity: 2, wrong_item: false, note: '확인' }] });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ version: 3, received_on: '2026-10-27', checked_by: 'QA', completed: true, lines: [{ item_id: 'line', actual_quantity: 2, wrong_item: false, note: '확인' }] });
  });
  it('메뉴 계산 결과를 수정 요청으로 되돌려 보내지 않는다', async () => {
    vi.stubEnv('VITE_API_MODE', 'http'); vi.resetModules();
    const { operationsApi } = await import('./api');
    const fetch = vi.fn().mockResolvedValue(new Response('{}')); vi.stubGlobal('fetch', fetch);
    const menu = { id: 'menu', name: 'QA', version: 2, selling_price: 5000, ingredient_cost: 9999, ingredients: [{ id: 'row', product_id: 'onion', quantity: .2, unit: 'kg', unit_price: 9999 }] };
    await operationsApi.saveMenu(menu);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.ingredient_cost).toBeUndefined(); expect(body.ingredients[0].unit_price).toBeUndefined();
  });
});
