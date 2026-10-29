import type { ReceiptStatus, WarningCode } from './types';
export const won = (n: number | null | undefined) =>
  n == null ? '미입력' : `${new Intl.NumberFormat('ko-KR').format(n)}원`;
export const num = (n: number) => new Intl.NumberFormat('ko-KR').format(n);
export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export const dateLabel = (date: string | null) =>
  date
    ? new Date(date.length === 10 ? date + 'T00:00:00+09:00' : date).toLocaleDateString('ko-KR', {
        month: 'long',
        day: 'numeric',
        timeZone: 'Asia/Seoul',
      })
    : '날짜 미확인';
export const timeLabel = (date: string) =>
  new Date(date).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  });
export const statuses: Record<ReceiptStatus, string> = {
  UPLOADED: '업로드 완료',
  PROCESSING: 'AI 분석 중',
  NEEDS_REVIEW: '확인 필요',
  READY_TO_APPROVE: '승인 가능',
  APPROVED: '반영 완료',
  FAILED: '분석 실패',
};
export const warnings: Record<WarningCode, string> = {
  PRICE_MISSING: '단가 미입력',
  OCR_UNCLEAR: '판독 확인 필요',
  AMOUNT_MISMATCH: '수량 × 단가와 금액 불일치',
  PRICE_ANOMALY: '직전 구매가 대비 큰 변동',
  UNIT_UNKNOWN: '규격·단위 확인 필요',
  UNMATCHED: '표준 식재료 연결 필요',
  TOTAL_MISMATCH: '문서 총액 불일치',
  DUPLICATE_SUSPECTED: '중복 문서 의심',
};
