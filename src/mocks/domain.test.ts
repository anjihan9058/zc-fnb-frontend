import { describe, expect, it } from 'vitest';
import { approveReceipt, previousPurchase, validateItem, validateReceipt } from './domain';
import { demoReceipt, products, seed } from './seed';
import { validateFile } from '../shared/api';
describe('미승인 값과 확정 구매 이력 분리', () => {
  it('초기 이상 단가는 확정 구매 이력에 포함되지 않는다', () => {
    const data = seed();
    expect(data.receipts[0].items[0].unit_price).toBe(25000);
    expect(data.purchases.some((p) => p.unit_price === 25000)).toBe(false);
  });
  it('정상 영수증은 승인 후에만 구매 행을 만든다', () => {
    const r = demoReceipt('normal', 'r1');
    expect(r.status).toBe('READY_TO_APPROVE');
    const result = approveReceipt(r, products, [], r.version);
    expect(result.receipt.status).toBe('APPROVED');
    expect(result.purchases).toHaveLength(2);
    expect(result.purchases[0].unit_price).toBe(2800);
  });
  it('승인 더블클릭과 응답 유실 후 재요청은 중복 행을 만들지 않는다', () => {
    const r = demoReceipt('normal', 'r1');
    const first = approveReceipt(r, products, [], r.version);
    const again = approveReceipt(first.receipt, products, first.purchases, r.version);
    expect(again.purchases).toHaveLength(2);
  });
  it('오래된 버전의 승인은 차단한다', () => {
    const r = demoReceipt('normal', 'r1');
    expect(() => approveReceipt(r, products, [], 0)).toThrow('다른 창');
  });
  it.each(['missing', 'anomaly', 'mismatch', 'unknown'])(
    '%s 검증 실패는 승인을 차단한다',
    (scenario) => {
      const r = demoReceipt(scenario, 'r1');
      expect(r.status).toBe('NEEDS_REVIEW');
      expect(() => approveReceipt(r, products, [], r.version)).toThrow('확인 필요한');
    },
  );
  it('가격 없는 검수 문서의 null은 이전 가격으로 대체되지 않는다', () => {
    const r = demoReceipt('missing', 'r');
    expect(r.items[0].unit_price).toBeNull();
    expect(r.items[0].warnings).toContain('PRICE_MISSING');
    expect(r.document_kind).toBe('DELIVERY_NOTE');
  });
  it('25,000 → 2,500 수정 후 합계도 맞아야 승인 가능하다', () => {
    const r = demoReceipt('anomaly', 'r');
    r.items[0].unit_price = 2500;
    expect(validateReceipt(r, products).status).toBe('NEEDS_REVIEW');
    r.items[0].line_total = 7500;
    expect(validateReceipt(r, products).status).toBe('READY_TO_APPROVE');
  });
  it('실제 가격 급등 확인은 산술 오류를 우회하지 않는다', () => {
    const r = demoReceipt('anomaly', 'r');
    r.items[0].anomaly_confirmed = true;
    expect(validateReceipt(r, products).status).toBe('READY_TO_APPROVE');
    r.items[0].line_total = 1;
    expect(validateReceipt(r, products).status).toBe('NEEDS_REVIEW');
  });
  it('단위가 다르면 가격 변동률을 계산하지 않는다', () => {
    const i = demoReceipt('normal', 'r').items[0];
    i.unit = '망';
    const checked = validateItem(i, products);
    expect(checked.comparison).toBeNull();
    expect(checked.warnings).toContain('UNIT_UNKNOWN');
  });
  it('수량 0, 비유한값과 음수 가격은 승인할 수 없다', () => {
    const i = demoReceipt('normal', 'r').items[0];
    expect(validateItem({ ...i, quantity: 0 }, products).warnings).toContain('OCR_UNCLEAR');
    expect(validateItem({ ...i, unit_price: Infinity }, products).warnings).toContain(
      'PRICE_MISSING',
    );
    expect(validateItem({ ...i, unit_price: -1 }, products).warnings).toContain('PRICE_MISSING');
  });
  it('날짜 또는 거래처가 없으면 승인할 수 없다', () => {
    const r = demoReceipt('normal', 'r');
    r.purchased_at = null;
    expect(validateReceipt(r, products).status).toBe('NEEDS_REVIEW');
  });
  it('직전 가격은 거래일 이전의 같은 단위만 선택한다', () => {
    const data = seed();
    expect(previousPurchase(data.purchases, 'onion', '망', '2099-01-01')).toBeUndefined();
    const prev = previousPurchase(data.purchases, 'onion', 'kg', '2099-01-01');
    expect(prev?.unit_price).toBe(2500);
  });
});
describe('첨부파일 입력', () => {
  it('지원되지 않는 형식과 빈 파일을 차단한다', () => {
    expect(() => validateFile(new File(['x'], 'x.html', { type: 'text/html' }))).toThrow('JPG');
    expect(() => validateFile(new File([], 'x.png', { type: 'image/png' }))).toThrow('0바이트');
  });
  it('10MB 초과는 차단하고 PDF는 허용한다', () => {
    expect(() =>
      validateFile(
        new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'x.png', { type: 'image/png' }),
      ),
    ).toThrow('10MB');
    expect(() =>
      validateFile(new File(['pdf'], 'x.pdf', { type: 'application/pdf' })),
    ).not.toThrow();
  });
});
