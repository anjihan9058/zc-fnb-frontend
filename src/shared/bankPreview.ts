export type PreviewBankStatus = 'UNMATCHED' | 'MATCHED' | 'EXCLUDED';
export interface PreviewBankRow {
  id: string;
  date: string;
  amount: number;
  name: string;
  note: string;
  status: PreviewBankStatus;
  matchedId?: string;
}
export const previewBankRows: PreviewBankRow[] = [
  {
    id: 'demo-bank-1',
    date: '2026-10-26',
    amount: -84000,
    name: '샘플 청과 거래처',
    note: '식재료 대금',
    status: 'UNMATCHED',
  },
  {
    id: 'demo-bank-2',
    date: '2026-10-26',
    amount: 356000,
    name: '샘플 카드 정산',
    note: '카드 매출 입금',
    status: 'UNMATCHED',
  },
  {
    id: 'demo-bank-3',
    date: '2026-10-25',
    amount: -42000,
    name: '샘플 식자재 업체',
    note: '주간 구매',
    status: 'UNMATCHED',
  },
  {
    id: 'demo-bank-4',
    date: '2026-10-25',
    amount: -120000,
    name: '샘플 계좌 간 이체',
    note: '내부 계좌 이동 · 비용 아님',
    status: 'EXCLUDED',
  },
];
export const previewPaymentRows = [
  {
    id: 'demo-pay-1',
    date: '2026-10-26',
    amount: 84000,
    name: '샘플 청과 거래처',
    number: 'DEMO-001',
  },
  {
    id: 'demo-pay-2',
    date: '2026-10-25',
    amount: 42000,
    name: '샘플 식자재 업체',
    number: 'DEMO-002',
  },
];
/** Preview state only; never posts a payment, journal or request to a financial provider. */
export function matchPreview(row: PreviewBankRow, paymentId: string): PreviewBankRow {
  const payment = previewPaymentRows.find((p) => p.id === paymentId);
  if (row.status !== 'UNMATCHED' || row.amount >= 0 || !payment || payment.amount !== -row.amount)
    throw new Error('출금액과 선택한 지급 금액이 같아야 연결할 수 있습니다.');
  return { ...row, status: 'MATCHED', matchedId: payment.id };
}
