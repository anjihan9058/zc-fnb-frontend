import { get, set } from 'idb-keyval';
import { mockApi } from './api';
import type {
  MenuCost,
  MenuRecipe,
  OperationsApi,
  ReceivingDocument,
  ReceivingStatus,
} from '../shared/operations';
import type { Product, Purchase, Receipt } from '../shared/types';
import { workspaceStorageKey } from '../shared/workspaces';
import { today } from '../shared/format';
import { unitFactor } from '../shared/units';
type Store = { menus: MenuRecipe[]; receiving: ReceivingDocument[] };
let queue: Promise<unknown> = Promise.resolve();
function db<T>(action: (data: Store) => T): Promise<T> {
  const key = workspaceStorageKey('zcfnb-operations-v1');
  const run = async () => {
    if (!navigator.onLine) throw new Error('오프라인입니다. 연결 후 다시 시도해 주세요.');
    const data: Store = (await get<Store>(key)) ?? { menus: [], receiving: [] };
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
function cost(menu: MenuRecipe, products: Product[], purchases: Purchase[]): MenuCost {
  const issues: string[] = [];
  if (menu.selling_price == null || menu.selling_price <= 0) issues.push('판매가격 미설정');
  if (!menu.ingredients.length) issues.push('레시피 미설정');
  const ingredients = menu.ingredients.map((row) => {
    const product = products.find((p) => p.id === row.product_id);
    const history = purchases
      .filter(
        (p) =>
          p.product_id === row.product_id &&
          unitFactor(row.unit, p.unit) != null &&
          p.purchased_at <= today(),
      )
      .sort((a, b) => a.purchased_at.localeCompare(b.purchased_at));
    const last = history.at(-1),
      previous = history.at(-2);
    if (!product) issues.push('연결되지 않은 식재료가 있습니다.');
    if (product && unitFactor(row.unit, product.unit) == null)
      issues.push(`${product.name}: 규격·단위 확인 필요`);
    if (row.quantity == null || row.quantity <= 0)
      issues.push(`${product?.name ?? '식재료'}: 사용량 미설정`);
    if (!last) issues.push(`${product?.name ?? '식재료'}: 확정 구매가격 없음`);
    const factor = last ? unitFactor(row.unit, last.unit) : null;
    return {
      ...row,
      name: product?.name ?? '미확인 식재료',
      unit_price: last && factor != null ? last.unit_price * factor : null,
      previous_unit_price: previous
        ? previous.unit_price * unitFactor(row.unit, previous.unit)!
        : null,
      line_cost:
        last &&
        factor != null &&
        row.quantity != null &&
        row.quantity > 0 &&
        product &&
        unitFactor(row.unit, product.unit) != null
          ? last.unit_price * row.quantity * factor
          : null,
      receipt_id: last?.receipt_id,
      purchase_unit: last?.unit,
      purchase_unit_price: last?.unit_price,
      quantity_in_purchase_unit:
        factor != null && row.quantity != null ? row.quantity * factor : undefined,
      purchased_at: last?.purchased_at ?? null,
      supplier: last?.supplier ?? null,
    };
  });
  const total =
    ingredients.length && ingredients.every((row) => row.line_cost != null)
      ? ingredients.reduce((sum, row) => sum + row.line_cost!, 0)
      : null;
  const previousTotal =
    total != null && ingredients.every((row) => row.previous_unit_price != null)
      ? ingredients.reduce((sum, row) => sum + row.previous_unit_price! * row.quantity!, 0)
      : null;
  const ready = total != null && menu.selling_price != null && menu.selling_price > 0;
  return {
    menu,
    ingredients,
    issues: [...new Set(issues)],
    ingredient_cost: total,
    previous_ingredient_cost: previousTotal,
    cost_rate: ready ? (total! / menu.selling_price!) * 100 : null,
    margin_rate: ready ? ((menu.selling_price! - total!) / menu.selling_price!) * 100 : null,
    margin_amount: ready ? menu.selling_price! - total! : null,
    price_change_amount: total != null && previousTotal != null ? total - previousTotal : null,
    calculated_at: new Date().toISOString(),
  };
}
function receivingFor(receipt: Receipt, saved?: ReceivingDocument): ReceivingDocument {
  const locked = saved?.completed;
  return {
    receipt_id: receipt.receipt_id,
    version: saved?.version ?? 0,
    supplier: receipt.supplier.name || '거래처 미확인',
    received_on: saved?.received_on ?? receipt.purchased_at ?? '',
    receipt_status: receipt.status,
    status: saved?.status ?? 'PENDING',
    checked_by: saved?.checked_by ?? '',
    checked_at: saved?.checked_at ?? null,
    completed: saved?.completed ?? false,
    lines:
      saved && locked
        ? saved.lines
        : receipt.items.map((item) => {
            const stored = saved?.lines.find((line) => line.item_id === item.id);
            return {
              item_id: item.id,
              name: item.normalized_name || item.raw_name,
              unit: item.unit,
              expected_quantity: item.quantity,
              actual_quantity: stored?.actual_quantity ?? null,
              wrong_item: stored?.wrong_item ?? false,
              note: stored?.note ?? '',
            };
          }),
  };
}
export const mockOperationsApi: OperationsApi = {
  menus: async () => {
    const [products, purchases] = await Promise.all([mockApi.products(), mockApi.prices()]);
    return db((data) => data.menus.map((menu) => cost(menu, products, purchases)));
  },
  saveMenu: (menu) =>
    db((data) => {
      const name = menu.name.trim();
      if (!name || name.length > 60) throw new Error('메뉴 이름은 1~60자로 입력해 주세요.');
      if (
        menu.selling_price != null &&
        (!Number.isFinite(menu.selling_price) || menu.selling_price <= 0)
      )
        throw new Error('판매가격은 0보다 큰 숫자로 입력해 주세요.');
      if (
        menu.ingredients.some(
          (row) =>
            !row.product_id ||
            !row.unit ||
            row.quantity == null ||
            !Number.isFinite(row.quantity) ||
            row.quantity <= 0,
        )
      )
        throw new Error('레시피의 식재료와 사용량을 확인해 주세요.');
      if (new Set(menu.ingredients.map((row) => row.product_id)).size !== menu.ingredients.length)
        throw new Error('같은 식재료는 사용량을 합쳐 한 행으로 입력해 주세요.');
      const old = data.menus.find((item) => item.id === menu.id);
      if ((old?.version ?? 0) !== menu.version)
        throw new Error('다른 창에서 메뉴가 변경되었습니다. 목록에서 다시 열어 주세요.');
      const saved = { ...structuredClone(menu), name, version: menu.version + 1 };
      if (old) data.menus[data.menus.indexOf(old)] = saved;
      else data.menus.push(saved);
      return saved;
    }),
  deleteMenu: (id, version) =>
    db((data) => {
      const menu = data.menus.find((item) => item.id === id);
      if (!menu) throw new Error('메뉴가 없습니다.');
      if (menu.version !== version)
        throw new Error('다른 창에서 메뉴가 변경되었습니다. 다시 불러와 주세요.');
      data.menus = data.menus.filter((item) => item.id !== id);
    }),
  receiving: async () => {
    const { recent } = await mockApi.summary();
    return db((data) =>
      recent
        .filter((receipt) => !['UPLOADED', 'PROCESSING', 'FAILED'].includes(receipt.status))
        .map((receipt) =>
          receivingFor(
            receipt,
            data.receiving.find((doc) => doc.receipt_id === receipt.receipt_id),
          ),
        ),
    );
  },
  saveReceiving: async (doc) => {
    const receipt = await mockApi.receipt(doc.receipt_id);
    if (['UPLOADED', 'PROCESSING', 'FAILED'].includes(receipt.status))
      throw new Error('영수증 분석이 끝난 뒤 검수해 주세요.');
    return db((data) => {
      const old = data.receiving.find((item) => item.receipt_id === doc.receipt_id);
      if ((old?.version ?? 0) !== doc.version)
        throw new Error('다른 창에서 검수 내역이 변경되었습니다. 다시 열어 주세요.');
      if (old?.completed) throw new Error('이미 검수가 완료된 문서입니다.');
      const current = receivingFor(receipt, old);
      if (
        doc.lines.length !== current.lines.length ||
        doc.lines.some(
          (line) =>
            !current.lines.some(
              (source) =>
                source.item_id === line.item_id &&
                source.expected_quantity === line.expected_quantity &&
                source.unit === line.unit,
            ),
        )
      )
        throw new Error('원본 품목·수량이 바뀌었습니다. 검수 화면을 다시 열어 주세요.');
      const lines = current.lines.map((source) => {
        const entered = doc.lines.find((line) => line.item_id === source.item_id)!;
        return {
          ...source,
          actual_quantity: entered.actual_quantity,
          wrong_item: entered.wrong_item,
          note: entered.note.trim().slice(0, 500),
        };
      });
      if (
        lines.some(
          (line) =>
            line.actual_quantity != null &&
            (!Number.isFinite(line.actual_quantity) || line.actual_quantity < 0),
        )
      )
        throw new Error('실제 입고 수량은 0 이상으로 입력해 주세요.');
      const receivedDate = new Date(`${doc.received_on}T00:00:00Z`);
      const validDate =
        /^\d{4}-\d{2}-\d{2}$/.test(doc.received_on) &&
        Number.isFinite(receivedDate.getTime()) &&
        receivedDate.toISOString().slice(0, 10) === doc.received_on &&
        doc.received_on <= today();
      if (
        doc.completed &&
        (!doc.checked_by.trim() ||
          !validDate ||
          !lines.length ||
          lines.some(
            (line) =>
              line.actual_quantity == null ||
              line.expected_quantity == null ||
              line.expected_quantity <= 0 ||
              !line.unit,
          ))
      )
        throw new Error('검수 담당자·입고일·원본 수량·실제 수량을 모두 확인해 주세요.');
      const result: ReceivingStatus = lines.some((line) => line.wrong_item)
        ? 'WRONG_ITEM'
        : lines.some(
              (line) =>
                line.actual_quantity != null &&
                line.expected_quantity != null &&
                line.actual_quantity < line.expected_quantity,
            )
          ? 'SHORTAGE'
          : lines.length &&
              lines.every(
                (line) =>
                  line.actual_quantity != null &&
                  line.expected_quantity != null &&
                  line.actual_quantity >= line.expected_quantity,
              )
            ? 'NORMAL'
            : 'PENDING';
      if (
        doc.completed &&
        lines.some(
          (line) =>
            (line.wrong_item || line.actual_quantity !== line.expected_quantity) &&
            !line.note.trim(),
        )
      )
        throw new Error('수량 차이·오배송 항목에는 비고를 남겨 주세요.');
      const saved: ReceivingDocument = {
        ...current,
        lines,
        checked_by: doc.checked_by.trim().slice(0, 60),
        received_on: doc.received_on,
        completed: doc.completed,
        status: doc.completed && result === 'NORMAL' ? 'COMPLETED' : result,
        checked_at: doc.completed ? new Date().toISOString() : null,
        version: doc.version + 1,
      };
      if (old) data.receiving[data.receiving.indexOf(old)] = saved;
      else data.receiving.push(saved);
      return saved;
    });
  },
};
