import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fetchMock = vi.fn();
beforeEach(() => { vi.resetModules(); vi.stubEnv('VITE_API_MODE', 'http'); vi.stubGlobal('navigator', { onLine: true }); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { fetchMock.mockReset(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const respond = (value: unknown, status = 200) => fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify(value), { status })));
describe('추가 실제 서버 어댑터 계약', () => {
  it('로그인·세션·로그아웃은 쿠키를 사용하고 사업장 헤더를 넣지 않는다', async () => {
    const { authApi } = await import('./api');
    respond({ id: 'u1', display_name: '테스트 사용자' });
    expect((await authApi.login('test@example.test', 'synthetic-password')).id).toBe('u1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/auth/login'); expect(init.credentials).toBe('include'); expect(init.headers['X-Workspace-Id']).toBeUndefined();
    expect(JSON.parse(init.body)).toEqual({ email: 'test@example.test', password: 'synthetic-password' });
    await authApi.session(); expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/auth/me');
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await authApi.logout(); expect(fetchMock.mock.calls[2][0]).toBe('/api/v1/auth/logout');
  });
  it('인증 실패는 세션 없음으로, 서버 장애는 오류로 구분한다', async () => {
    const { authApi } = await import('./api');
    respond({}, 401); expect(await authApi.session()).toBeNull();
    await expect(authApi.login('test@example.test', 'wrong')).rejects.toThrow('이메일과 비밀번호');
    respond({}, 500); await expect(authApi.session()).rejects.toThrow('500');
  });
  it('텍스트 근무표는 연도·직원 연결·원문 메시지를 전송한다', async () => {
    const { httpScheduleApi } = await import('./api');
    const input = { text: '직원 가\n10/1 18:00~22:00 4', year: 2026, room_id: 'room', source_message_id: 'message', employees: [{ raw_name: '직원 가', employee_id: null, create: true }] };
    respond({ schedule_id: 'schedule' });
    await httpScheduleApi.importText(input);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/work-schedules/from-text');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(input);
    expect(fetchMock.mock.calls[0][1].headers['X-Workspace-Id']).toBeTruthy();
  });
  it('근무표 수정·확정은 버전과 멱등 키를 보낸다', async () => {
    const { httpScheduleApi } = await import('./api');
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await httpScheduleApi.save('id/1', [], 3); await httpScheduleApi.confirm('id/1', 4, 'same-key');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/work-schedules/id%2F1');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ version: 4, idempotency_key: 'same-key' });
  });
  it('채팅방·파일 첨부는 문서 분석과 별도 API를 호출한다', async () => {
    const { httpApi } = await import('./api');
    respond({ id: 'message' });
    await httpApi.createRoom('주방'); await httpApi.attach('room/1', new File(['test'], 'test.pdf', { type: 'application/pdf' }));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/chat/rooms');
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/v1/rooms/room%2F1/messages/attachments'); expect(init.body.get('file').name).toBe('test.pdf');
    expect(init.headers['Content-Type']).toBeUndefined();
  });
  it('허용하지 않는 영수증과 일반 첨부는 서버로 보내지 않는다', async () => {
    const { httpApi } = await import('./api');
    await expect(httpApi.upload(new File(['x'], 'x.exe', { type: 'application/octet-stream' }), 'room')).rejects.toThrow('JPG');
    expect(() => httpApi.attach('room', new File(['x'], 'x.exe', { type: 'application/octet-stream' }))).toThrow('JPG');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('메뉴·입고는 실제 모드에서 서버 계산값과 저장 결과를 그대로 사용한다', async () => {
    const { operationsApi } = await import('./api');
    const value = [{ menu: { id: 'menu' }, ingredient_cost: 1234, margin_rate: 75.32 }];
    respond(value); expect(await operationsApi.menus()).toEqual(value);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/menus/costs');
    const record: Parameters<typeof operationsApi.saveReceiving>[0] = { receipt_id: 'receipt', version: 3, lines: [], supplier: 'QA', received_on: '2026-10-27', receipt_status: 'NEEDS_REVIEW', status: 'PENDING', checked_by: '', checked_at: null, completed: false };
    respond(record); expect(await operationsApi.saveReceiving(record)).toEqual(record);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/receiving/receipt');
  });
});
