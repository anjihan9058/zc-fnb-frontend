import type { Product, Receipt, ReceiptItem, Purchase, WarningCode } from '../shared/types';
export function validateItem(item: ReceiptItem, products: Product[]): ReceiptItem {
  const warnings: WarningCode[] = [];
  const product = products.find((p) => p.id === item.product_id);
  if (!product) warnings.push('UNMATCHED');
  if (!product || product.unit !== item.unit) warnings.push('UNIT_UNKNOWN');
  if (item.unit_price == null || !Number.isFinite(item.unit_price) || item.unit_price <= 0)
    warnings.push('PRICE_MISSING');
  if (
    item.quantity == null ||
    !Number.isFinite(item.quantity) ||
    item.quantity <= 0 ||
    item.line_total == null ||
    !Number.isFinite(item.line_total) ||
    item.line_total <= 0
  )
    warnings.push('OCR_UNCLEAR');
  if (
    item.quantity != null &&
    item.unit_price != null &&
    item.line_total != null &&
    Math.abs(item.quantity * item.unit_price - item.line_total) > 1
  )
    warnings.push('AMOUNT_MISMATCH');
  const comparison =
    item.comparison && item.comparison.comparison_unit === item.unit
      ? {
          ...item.comparison,
          change_pct:
            item.unit_price == null
              ? 0
              : (item.unit_price / item.comparison.previous_price - 1) * 100,
        }
      : null;
  if (comparison && Math.abs(comparison.change_pct) >= 30 && !item.anomaly_confirmed)
    warnings.push('PRICE_ANOMALY');
  return {
    ...item,
    normalized_name: product?.name ?? item.raw_name,
    warnings,
    comparison,
    status: warnings.length ? 'NEEDS_REVIEW' : 'READY_TO_APPROVE',
  };
}
export function validateReceipt(receipt: Receipt, products: Product[]): Receipt {
  const items = receipt.items.map((i) => validateItem(i, products));
  return {
    ...receipt,
    items,
    has_price: items.some((i) => i.unit_price != null),
    status:
      items.length &&
      items.every((i) => i.status === 'READY_TO_APPROVE') &&
      receipt.purchased_at &&
      receipt.supplier.name.trim()
        ? 'READY_TO_APPROVE'
        : 'NEEDS_REVIEW',
  };
}
export function approveReceipt(
  receipt: Receipt,
  products: Product[],
  purchases: Purchase[],
  version: number,
): { receipt: Receipt; purchases: Purchase[] } {
  if (receipt.status === 'APPROVED') return { receipt, purchases };
  if (version !== receipt.version)
    throw new Error('다른 창에서 수정되었습니다. 새로고침 후 다시 확인해 주세요.');
  if (
    receipt.status !== 'READY_TO_APPROVE' ||
    validateReceipt(receipt, products).status !== 'READY_TO_APPROVE'
  )
    throw new Error('확인 필요한 항목을 먼저 수정하고 재검증해 주세요.');
  if (purchases.some((p) => p.receipt_id === receipt.receipt_id))
    throw new Error('이미 반영된 영수증입니다.');
  const added: Purchase[] = receipt.items.map((i) => ({
    id: `${receipt.receipt_id}-${i.id}`,
    receipt_id: receipt.receipt_id,
    product_id: i.product_id!,
    name: i.normalized_name,
    unit: i.unit,
    unit_price: i.unit_price!,
    quantity: i.quantity!,
    supplier: receipt.supplier.name,
    purchased_at: receipt.purchased_at!,
  }));
  return {
    receipt: {
      ...receipt,
      status: 'APPROVED',
      version: receipt.version + 1,
      items: receipt.items.map((i) => ({ ...i, status: 'APPROVED' })),
    },
    purchases: [...purchases, ...added],
  };
}
export function previousPurchase(
  purchases: Purchase[],
  product: string,
  unit: string,
  before: string,
) {
  return purchases
    .filter((p) => p.product_id === product && p.unit === unit && p.purchased_at < before)
    .sort((a, b) => b.purchased_at.localeCompare(a.purchased_at))[0];
}
