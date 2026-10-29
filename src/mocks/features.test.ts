import 'fake-indexeddb/auto';
import { del } from 'idb-keyval';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from './api';
import { mockScheduleApi } from './schedules';
import { mockOperationsApi } from './operations';
import { defaultWorkspace, localWorkspaces, selectWorkspace } from '../shared/workspaces';
import type { MenuRecipe } from '../shared/operations';
import { today } from '../shared/format';

beforeEach(async () => {
  vi.stubGlobal('navigator', { onLine: true });
  const session = new Map<string, string>();
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => session.get(key) ?? null, setItem: (key: string, value: string) => session.set(key, value) });
  selectWorkspace(defaultWorkspace.id, true);
  await Promise.all(['sikjangbu-demo-v1', 'sikjangbu-schedules-v1', 'zcfnb-operations-v1', 'zcfnb-workspaces-v1'].map((key) => del(key)));
});
afterEach(() => { selectWorkspace(defaultWorkspace.id, true); vi.useRealTimers(); vi.unstubAllGlobals(); });
const recipe = (): MenuRecipe => ({ id: 'menu-test', name: '테스트 메뉴', selling_price: 5000, version: 0, ingredients: [{ id: 'r1', product_id: 'onion', quantity: .2, unit: 'kg' }] });
const textInput = () => ({ text: '직원 가\n10/1 18:00 ~ 00:30 6.5\n총 근무시간 : 6.5', room_id: defaultWorkspace.room_id, year: 2026, source_message_id: 'message-test', employees: [{ raw_name: '직원 가', employee_id: null, create: true }] });
describe('사업장·채팅', () => {
  it('채팅방을 만들고 긴 텍스트를 보내며 방별 대화를 분리한다', async () => {
    const room = await mockApi.createRoom('검증 채팅');
    const value = '근무표 긴 원문\n'.repeat(300);
    await mockApi.send(room.id, value);
    expect((await mockApi.messages(room.id)).some((m) => m.text === value.trim())).toBe(true);
    expect((await mockApi.messages(defaultWorkspace.room_id)).some((m) => m.text === value.trim())).toBe(false);
    await expect(mockApi.send('unknown-room', 'test')).rejects.toThrow('채팅방');
  });
  it('사업장 생성과 실제 저장소 격리·중복 이름 거절', async () => {
    const first = await localWorkspaces.create('검증 지점 A', '가상 주소');
    const second = await localWorkspaces.create('검증 지점 B', '');
    await expect(localWorkspaces.create('검증 지점 A', '')).rejects.toThrow('같은 이름');
    selectWorkspace(first.id, true);
    await mockApi.send(first.room_id, 'A의 대화');
    await mockScheduleApi.addEmployee('A 직원');
    await mockOperationsApi.saveMenu(recipe());
    expect(await mockApi.prices()).toEqual([]);
    selectWorkspace(second.id, true);
    expect(await mockApi.messages(second.room_id)).toEqual([]);
    expect(await mockScheduleApi.employees()).toEqual([]);
    expect(await mockOperationsApi.menus()).toEqual([]);
    selectWorkspace(first.id, true);
    expect((await mockApi.messages(first.room_id))[0].text).toBe('A의 대화');
    expect((await mockScheduleApi.employees())[0].name).toBe('A 직원');
    expect(await mockOperationsApi.menus()).toHaveLength(1);
  });
});
describe('텍스트 근무표 저장·확정', () => {
  it('텍스트를 직원과 연결해 초안을 만들고 누락 확인 후 한 번만 일정에 반영한다', async () => {
    const created = await mockScheduleApi.importText(textInput());
    const draft = await mockScheduleApi.get(created.schedule_id);
    expect(draft.status).toBe('NEEDS_REVIEW');
    expect(draft.source_text).toBe(textInput().text);
    expect(draft.shifts[0].employee_id).not.toBeNull();
    expect(await mockScheduleApi.shifts()).toEqual([]);
    await expect(mockScheduleApi.confirm(draft.schedule_id, draft.version, 'key')).rejects.toThrow('휴게');
    await mockScheduleApi.save(draft.schedule_id, draft.shifts.map((row) => ({ ...row, break_minutes: 0, reviewed: true })), draft.version);
    const saved = await mockScheduleApi.get(draft.schedule_id);
    await Promise.all([mockScheduleApi.confirm(saved.schedule_id, saved.version, 'key'), mockScheduleApi.confirm(saved.schedule_id, saved.version, 'key')]);
    expect((await mockScheduleApi.get(saved.schedule_id)).status).toBe('CONFIRMED');
    expect(await mockScheduleApi.shifts()).toHaveLength(1);
    await expect(mockScheduleApi.save(saved.schedule_id, saved.shifts, saved.version + 1)).rejects.toThrow('수정할 수 없습니다');
  });
  it('같은 원문 재요청은 같은 문서를 반환하고 직원도 중복 생성하지 않는다', async () => {
    const first = await mockScheduleApi.importText(textInput());
    const second = await mockScheduleApi.importText(textInput());
    expect(second.schedule_id).toBe(first.schedule_id);
    expect(await mockScheduleApi.list()).toHaveLength(1);
    expect((await mockScheduleApi.employees()).filter((e) => e.name === '직원 가')).toHaveLength(1);
  });
  it('연도·직원 연결·버전 누락과 기존 확정 근무 충돌을 차단한다', async () => {
    await expect(mockScheduleApi.importText({ ...textInput(), year: 0 })).rejects.toThrow('연도');
    await expect(mockScheduleApi.importText({ ...textInput(), employees: [] })).rejects.toThrow('직원');
    const first = await mockScheduleApi.importText(textInput());
    let doc = await mockScheduleApi.get(first.schedule_id);
    await expect(mockScheduleApi.save(doc.schedule_id, doc.shifts, 0)).rejects.toThrow('변경');
    await mockScheduleApi.save(doc.schedule_id, doc.shifts.map((r) => ({ ...r, break_minutes: 0, reviewed: true })), doc.version);
    doc = await mockScheduleApi.get(doc.schedule_id); await mockScheduleApi.confirm(doc.schedule_id, doc.version, 'first');
    const second = await mockScheduleApi.importText({ ...textInput(), source_message_id: 'another', text: '직원 가\n10/1 23:00 ~ 01:00 2' });
    let other = await mockScheduleApi.get(second.schedule_id);
    await mockScheduleApi.save(other.schedule_id, other.shifts.map((r) => ({ ...r, break_minutes: 0, reviewed: true })), other.version);
    other = await mockScheduleApi.get(other.schedule_id);
    await expect(mockScheduleApi.confirm(other.schedule_id, other.version, 'second')).rejects.toThrow('겹칩니다');
  });
});
describe('메뉴 원가·마진과 입고 검수', () => {
  it('확정 단가와 레시피 사용량으로 계산하고 판매가격이 없으면 비율은 비운다', async () => {
    let saved = await mockOperationsApi.saveMenu(recipe());
    const calculated = (await mockOperationsApi.menus())[0];
    expect(calculated.ingredient_cost).toBe(500); expect(calculated.cost_rate).toBe(10); expect(calculated.margin_rate).toBe(90);
    saved = await mockOperationsApi.saveMenu({ ...saved, selling_price: null });
    const missingPrice = (await mockOperationsApi.menus())[0];
    expect(missingPrice.ingredient_cost).toBe(500); expect(missingPrice.cost_rate).toBeNull(); expect(missingPrice.margin_rate).toBeNull();
    await expect(mockOperationsApi.saveMenu({ ...saved, version: 0 })).rejects.toThrow('변경');
    await mockOperationsApi.deleteMenu(saved.id, saved.version); expect(await mockOperationsApi.menus()).toEqual([]);
  });
  it('레시피·확정 단가·단위가 맞지 않으면 원가와 마진을 추정하지 않는다', async () => {
    let saved = await mockOperationsApi.saveMenu({ ...recipe(), ingredients: [] });
    expect((await mockOperationsApi.menus())[0].ingredient_cost).toBeNull();
    saved = await mockOperationsApi.saveMenu({ ...saved, ingredients: [{ ...recipe().ingredients[0], unit: '봉지' }] });
    expect((await mockOperationsApi.menus())[0].ingredient_cost).toBeNull();
    await mockApi.saveProduct({ id: 'no-price', name: '새 식재료', unit: 'kg', category: '기타', aliases: [] });
    await mockOperationsApi.saveMenu({ ...saved, ingredients: [{ ...recipe().ingredients[0], product_id: 'no-price' }] });
    expect((await mockOperationsApi.menus())[0].margin_rate).toBeNull();
  });
  it('가격 승인 전후에만 메뉴 원가가 바뀐다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await mockOperationsApi.saveMenu(recipe());
    const r = await mockApi.sample('normal', defaultWorkspace.room_id);
    vi.setSystemTime(Date.now() + 5000);
    const ready = await mockApi.receipt(r.receipt_id);
    expect((await mockOperationsApi.menus())[0].ingredient_cost).toBe(500);
    await mockApi.approve(ready.receipt_id, ready.version, 'approved');
    expect((await mockOperationsApi.menus())[0].ingredient_cost).toBe(560);
  });
  it('150g 사용량을 kg 구매단가로 계산하고 근거 영수증을 유지한다', async () => {
    await mockOperationsApi.saveMenu({...recipe(),ingredients:[{...recipe().ingredients[0],quantity:150,unit:'g'}]});
    const result=(await mockOperationsApi.menus())[0];
    expect(result.ingredient_cost).toBe(375);
    expect(result.ingredients[0].quantity_in_purchase_unit).toBe(.15);
    expect(result.ingredients[0].purchase_unit).toBe('kg');
    expect(result.ingredients[0].unit_price).toBe(2.5);
    expect(result.ingredients[0].receipt_id).toBeTruthy();
  });
  it('입고 기록 확정은 구매 이력과 메뉴 가격을 바꾸지 않는다', async () => {
    const prices = await mockApi.prices();
    const doc = (await mockOperationsApi.receiving()).find((item) => item.receipt_id === 'demo-missing')!;
    const done = await mockOperationsApi.saveReceiving({ ...doc, received_on: today(), checked_by: '가상 검수자', completed: true, lines: doc.lines.map((line) => ({ ...line, actual_quantity: line.expected_quantity })) });
    expect(done.status).toBe('COMPLETED'); expect(done.completed).toBe(true); expect(done.checked_at).not.toBeNull();
    expect(await mockApi.prices()).toEqual(prices);
    expect((await mockApi.receipt(doc.receipt_id)).status).not.toBe('APPROVED');
    await expect(mockOperationsApi.saveReceiving(done)).rejects.toThrow('완료');
  });
  it('누락·오배송은 비고를 요구하고 실제 수량·담당자 누락을 차단한다', async () => {
    const doc = (await mockOperationsApi.receiving())[0];
    await expect(mockOperationsApi.saveReceiving({ ...doc, completed: true })).rejects.toThrow('담당자');
    const partial = { ...doc, completed: true, received_on: today(), checked_by: '가상 검수자', lines: doc.lines.map((line) => ({ ...line, actual_quantity: 0 })) };
    await expect(mockOperationsApi.saveReceiving(partial)).rejects.toThrow('비고');
    const saved = await mockOperationsApi.saveReceiving({ ...partial, lines: partial.lines.map((line) => ({ ...line, note: '가상 미도착 기록' })) });
    expect(saved.status).toBe('SHORTAGE'); expect(saved.completed).toBe(true);
  });
  it('오프라인 저장은 메뉴·근무표·검수 모두 거절한다', async () => {
    const doc = (await mockOperationsApi.receiving())[0];
    vi.stubGlobal('navigator', { onLine: false });
    await expect(mockOperationsApi.saveMenu(recipe())).rejects.toThrow('오프라인');
    await expect(mockScheduleApi.importText(textInput())).rejects.toThrow('오프라인');
    await expect(mockOperationsApi.saveReceiving(doc)).rejects.toThrow('오프라인');
  });
});
