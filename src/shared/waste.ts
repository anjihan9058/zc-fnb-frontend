import type { Purchase } from './types';
import { unitFactor } from './units';

/**
 * 폐기 기록. Discarded stock is recorded separately from recipe costs: it never
 * changes a menu's expected cost rate. It is kept for the accounting side —
 * explaining the gap between recipe cost and the stock actually used, and the
 * 폐기 손실 line of a P&L once sales and stock counts are connected.
 */
export type WasteReason = 'EXPIRED' | 'SPOILED' | 'PREP_ERROR' | 'DAMAGED' | 'OTHER';
export const wasteReasons: Record<WasteReason, string> = {
  EXPIRED: '유통기한 경과',
  SPOILED: '변질 · 품질 불량',
  PREP_ERROR: '조리 · 보관 실수',
  DAMAGED: '파손 · 오염',
  OTHER: '기타',
};
export interface WasteRecord {
  id: string;
  version: number;
  wasted_on: string;
  product_id: string;
  name: string;
  quantity: number;
  unit: string;
  reason: WasteReason;
  note: string;
  recorded_by: string;
  created_at: string;
}
export interface WasteInput {
  id?: string;
  version?: number;
  wasted_on: string;
  product_id: string;
  quantity: number;
  unit: string;
  reason: WasteReason;
  note: string;
}
export interface WasteApi {
  list(): Promise<WasteRecord[]>;
  save(input: WasteInput): Promise<WasteRecord>;
  remove(id: string, version: number): Promise<void>;
}

export function validateWaste(input: WasteInput) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.wasted_on)) throw new Error('폐기일을 선택해 주세요.');
  if (!input.product_id) throw new Error('폐기한 식재료를 선택해 주세요.');
  if (!Number.isFinite(input.quantity) || input.quantity <= 0)
    throw new Error('폐기 수량을 0보다 크게 입력해 주세요.');
  if (!input.unit) throw new Error('수량 단위를 선택해 주세요.');
  if (!(input.reason in wasteReasons)) throw new Error('폐기 사유를 선택해 주세요.');
  if (input.note.length > 200) throw new Error('메모는 200자 이내로 입력해 주세요.');
}

/**
 * Estimated loss = quantity × the latest confirmed purchase price on or before
 * the waste date, converted to the same unit. Returns null when no comparable
 * confirmed price exists, so nothing is guessed.
 */
export function wasteLoss(
  record: Pick<WasteRecord, 'product_id' | 'quantity' | 'unit' | 'wasted_on'>,
  purchases: Purchase[],
) {
  const last = purchases
    .filter(
      (p) =>
        p.product_id === record.product_id &&
        p.purchased_at <= record.wasted_on &&
        unitFactor(record.unit, p.unit) != null,
    )
    .sort((a, b) => a.purchased_at.localeCompare(b.purchased_at))
    .at(-1);
  if (!last) return null;
  const factor = unitFactor(record.unit, last.unit)!;
  return {
    amount: Math.round(record.quantity * factor * last.unit_price),
    unit_price: last.unit_price,
    price_unit: last.unit,
    purchased_at: last.purchased_at,
  };
}
