import { get, set } from 'idb-keyval';
import { mockApi } from './api';
import { demoUser } from '../shared/auth';
import { createId } from '../shared/id';
import { workspaceStorageKey } from '../shared/workspaces';
import { validateWaste, type WasteApi, type WasteRecord } from '../shared/waste';

type Store = { records: WasteRecord[] };
let queue: Promise<unknown> = Promise.resolve();
// Same pattern as the other demo stores: one key per 사업장, serialized writes.
function db<T>(action: (data: Store) => T): Promise<T> {
  const key = workspaceStorageKey('zcfnb-waste-v1');
  const run = async () => {
    if (!navigator.onLine) throw new Error('오프라인입니다. 연결 후 다시 시도해 주세요.');
    const data: Store = (await get<Store>(key)) ?? { records: [] };
    const result = action(data);
    await set(key, data);
    return structuredClone(result);
  };
  const locked = async (): Promise<T> =>
    navigator.locks ? await navigator.locks.request(key, run) : await run();
  const result = queue.then(locked, locked);
  queue = result.catch(() => {});
  return result;
}

export const mockWasteApi: WasteApi = {
  list: () =>
    db((s) =>
      [...s.records].sort(
        (a, b) =>
          b.wasted_on.localeCompare(a.wasted_on) || b.created_at.localeCompare(a.created_at),
      ),
    ),
  save: async (input) => {
    validateWaste(input);
    const product = (await mockApi.products()).find((p) => p.id === input.product_id);
    if (!product) throw new Error('식재료 관리에 등록된 품목을 선택해 주세요.');
    return db((s) => {
      const existing = input.id ? s.records.find((r) => r.id === input.id) : undefined;
      if (input.id && !existing) throw new Error('삭제되었거나 없는 폐기 기록입니다.');
      if (existing && existing.version !== input.version)
        throw new Error('다른 화면에서 먼저 수정했습니다. 새로 불러온 뒤 다시 저장해 주세요.');
      const record: WasteRecord = {
        id: existing?.id ?? createId(),
        version: (existing?.version ?? 0) + 1,
        wasted_on: input.wasted_on,
        product_id: product.id,
        name: product.name,
        quantity: input.quantity,
        unit: input.unit,
        reason: input.reason,
        note: input.note.trim(),
        recorded_by: existing?.recorded_by ?? demoUser.display_name,
        created_at: existing?.created_at ?? new Date().toISOString(),
      };
      s.records = existing
        ? s.records.map((r) => (r.id === record.id ? record : r))
        : [record, ...s.records];
      return record;
    });
  },
  remove: (id, version) =>
    db((s) => {
      const existing = s.records.find((r) => r.id === id);
      if (!existing) return;
      if (existing.version !== version)
        throw new Error('다른 화면에서 먼저 수정했습니다. 새로 불러온 뒤 다시 삭제해 주세요.');
      s.records = s.records.filter((r) => r.id !== id);
    }),
};
