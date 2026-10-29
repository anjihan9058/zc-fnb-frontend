import { describe, expect, it } from 'vitest';
import { matchPreview, previewBankRows } from './bankPreview';

describe('은행 화면 체험용 연결', () => {
  it('금액이 일치하는 출금을 연결하되 원본 샘플은 바꾸지 않는다', () => {
    const before = structuredClone(previewBankRows[0]);
    expect(matchPreview(before, 'demo-pay-1')).toMatchObject({
      status: 'MATCHED',
      matchedId: 'demo-pay-1',
    });
    expect(before.status).toBe('UNMATCHED');
    expect(previewBankRows[0].status).toBe('UNMATCHED');
  });
  it('다른 금액이나 없는 지급 기록에는 연결할 수 없다', () => {
    expect(() => matchPreview(previewBankRows[0], 'demo-pay-2')).toThrow();
    expect(() => matchPreview(previewBankRows[0], 'unknown')).toThrow();
  });
  it('입금·제외·이미 연결한 거래의 확정을 차단한다', () => {
    expect(() => matchPreview(previewBankRows[1], 'demo-pay-1')).toThrow();
    expect(() =>
      matchPreview({ ...previewBankRows[0], status: 'EXCLUDED' }, 'demo-pay-1'),
    ).toThrow();
    expect(() =>
      matchPreview(matchPreview(previewBankRows[0], 'demo-pay-1'), 'demo-pay-1'),
    ).toThrow();
  });
});
