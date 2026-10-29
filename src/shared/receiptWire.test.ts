import { describe, it, expect } from 'vitest';
import { receiptFromWire } from './receiptWire';
const sample = () => ({
  schema_version: '1',
  receipt_id: 'r',
  version: 2,
  status: 'NEEDS_REVIEW',
  source: { room_id: 'room', message_id: 'message' },
  classification: { document_kind: 'TRANSACTION_STATEMENT', input_style: 'HANDWRITTEN' },
  supplier: { id: null, name: '테스트 거래처' },
  file: { name: 'receipt.pdf', mime_type: 'application/pdf', url: null },
  amounts: { supply_amount: null, tax_amount: null, total_amount: '8400' },
  items: [
    {
      id: 'i',
      raw_name: '양파',
      product_id: null,
      quantity: '3',
      unit: 'kg',
      unit_price: '2800',
      line_total: '8400',
    },
  ],
  issues: [
    {
      code: 'UNMATCHED',
      path: 'items.i.product_id',
      severity: 'BLOCKING',
      message: '식재료 연결 필요',
    },
  ],
  capabilities: { can_edit: true, can_approve: false },
});
describe('영수증 API 응답 정규화', () => {
  it('AI 구조화 응답의 금액·출처·분류·승인 차단을 보존한다', () => {
    const r = receiptFromWire(sample());
    expect(r.amounts?.total_amount).toBe(8400);
    expect(r.amounts?.tax_amount).toBeNull();
    expect(r.items[0].unit_price).toBe(2800);
    expect(r.items[0].warnings).toContain('UNMATCHED');
    expect(r.source_message_id).toBe('message');
    expect(r.file_type).toBe('application/pdf');
    expect(r.document_kind).toBe('TRANSACTION_STATEMENT');
    expect(r.capabilities?.can_approve).toBe(false);
    expect(r.upload_mode).toBeUndefined();
  });
  it('추출하지 못한 금액을 0으로 채우지 않고 낯선 문서 분류는 미확인으로 둔다', () => {
    const v = sample();
    v.classification.document_kind = 'OTHER';
    const r = receiptFromWire({ ...v, items: [{ id: 'i', raw_name: '흐린 품목' }] });
    expect(r.items[0].unit_price).toBeNull();
    expect(r.items[0].quantity).toBeNull();
    expect(r.document_kind).toBe('UNKNOWN');
  });
  it('접수 상태는 빈 품목을 허용하지만 계약이 깨진 완료 응답과 잘못된 숫자는 거절한다', () => {
    expect(receiptFromWire({ receipt_id: 'r', version: 1, status: 'PROCESSING' }).items).toEqual(
      [],
    );
    expect(() => receiptFromWire({ receipt_id: 'r', version: 1, status: 'APPROVED' })).toThrow(
      '품목',
    );
    expect(() => receiptFromWire({ ...sample(), items: [{ id: 'i', unit_price: 'NaN' }] })).toThrow(
      '응답 형식',
    );
    expect(() => receiptFromWire({ ...sample(), status: 'toString' })).toThrow('응답 형식');
  });
});
