import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Info } from 'lucide-react';
import { usePrices, useWasteRecords } from '../app/hooks';
import { scheduleApi } from '../shared/api';
import { won } from '../shared/format';
import { wasteLoss } from '../shared/waste';

type Status = 'linked' | 'partial' | 'missing' | 'formula';
const statusLabel: Record<Status, string> = {
  linked: '이 앱에서 연결됨',
  partial: '일부 연결',
  missing: '연결 필요',
  formula: '자동 계산',
};

/*
 * Example figures for one month of a small restaurant. They are shown only in
 * the clearly labelled 예시 view and are never mixed with the store's data.
 * 매출원가 = 기초 재고 2,100,000 + 매입 11,800,000 − 기말 재고 2,700,000.
 */
const example = {
  sales: 32_000_000,
  rows: [
    { name: '매출', amount: 32_000_000, kind: 'total', source: 'POS · 카드 매출' },
    {
      name: '매출원가 (식재료)',
      amount: 11_200_000,
      kind: 'group',
      source: '기초 재고 + 매입 − 기말 재고',
    },
    { name: '식재료 매입', amount: 11_800_000, kind: 'sub', source: '확정 구매 기록', app: true },
    { name: '재고 증감', amount: -600_000, kind: 'sub', source: '재고 실사' },
    {
      name: '그중 폐기 손실',
      amount: 380_000,
      kind: 'note',
      source: '폐기 기록',
      app: true,
    },
    { name: '매출총이익', amount: 20_800_000, kind: 'total', source: '매출 − 매출원가' },
    {
      name: '인건비',
      amount: 9_600_000,
      kind: 'group',
      source: '근무표 실근무 × 시급 · 급여',
      app: true,
    },
    {
      name: '기타 운영비',
      amount: 5_400_000,
      kind: 'group',
      source: '임대료 · 공과금 · 카드 수수료 등 장부',
    },
    {
      name: '영업이익',
      amount: 5_800_000,
      kind: 'total',
      source: '매출총이익 − 인건비 − 기타 운영비',
    },
  ],
} as const;

export function ProfitReport({ from, to }: { from: string; to: string }) {
  const [mode, setMode] = useState<'status' | 'example'>('status');
  const prices = usePrices(),
    waste = useWasteRecords(),
    shifts = useQuery({ queryKey: ['shifts'], queryFn: scheduleApi.shifts });
  const inRange = (date: string) => (!from || date >= from) && (!to || date <= to);
  const purchases = prices.data?.filter((p) => inRange(p.purchased_at));
  const wasted = waste.data?.filter((r) => inRange(r.wasted_on));
  const wasteTotal = wasted?.reduce(
    (n, r) => n + (wasteLoss(r, prices.data ?? [])?.amount ?? 0),
    0,
  );
  const shiftCount = shifts.data?.filter((s) => inRange(s.starts_at.slice(0, 10))).length;

  const lines: {
    name: string;
    sub?: boolean;
    need: string;
    status: Status;
    detail?: string;
    to?: string;
  }[] = [
    { name: '매출', need: 'POS · 카드 매출', status: 'missing', detail: '매출 자료 연결 전' },
    {
      name: '매출원가 (식재료)',
      need: '확정 구매 + 재고 실사',
      status: 'partial',
      detail: purchases
        ? `확정 구매 ${won(purchases.reduce((n, p) => n + p.quantity * p.unit_price, 0))} · 재고 실사 미연결`
        : undefined,
      to: '/reports?view=purchase',
    },
    {
      name: '그중 폐기 손실',
      sub: true,
      need: '폐기 기록',
      status: 'linked',
      detail: wasted ? `${wasted.length}건 · 추정 ${won(wasteTotal ?? 0)}` : undefined,
      to: '/waste',
    },
    { name: '매출총이익', need: '매출 − 매출원가', status: 'formula', detail: '매출 연결 후 계산' },
    {
      name: '인건비',
      need: '근무표 실근무 + 시급 · 급여',
      status: 'partial',
      detail: shiftCount != null ? `확정 근무 ${shiftCount}건 · 시급 미연결` : undefined,
      to: '/schedules',
    },
    { name: '기타 운영비', need: '회계 장부', status: 'missing', detail: '장부 연결 전' },
    {
      name: '영업이익',
      need: '매출총이익 − 인건비 − 기타 운영비',
      status: 'formula',
      detail: '모든 항목 연결 후 계산',
    },
  ];

  return (
    <div className="profit-report">
      <div className="profit-report-bar">
        <div className="segmented-control" aria-label="손익 보고서 보기 방식">
          <button
            aria-pressed={mode === 'status'}
            className={mode === 'status' ? 'active' : ''}
            onClick={() => setMode('status')}
          >
            자료 연결 현황
          </button>
          <button
            aria-pressed={mode === 'example'}
            className={mode === 'example' ? 'active' : ''}
            onClick={() => setMode('example')}
          >
            예시 보기
          </button>
        </div>
        <span>
          {mode === 'status'
            ? '어떤 자료가 모이면 손익이 계산되는지 보여줍니다.'
            : '완성되면 이렇게 보입니다. 가게 실제 숫자가 아닙니다.'}
        </span>
      </div>

      {mode === 'status' ? (
        <>
          <div className="workspace-context-note">
            <Info size={15} />
            매출과 회계 장부가 연결되기 전에는 손익을 계산하지 않습니다. 구매금액을 매출원가나
            이익으로 대신 표시하지 않습니다.
          </div>
          <table className="profit-table">
            <thead>
              <tr>
                <th>계정</th>
                <th>필요한 자료</th>
                <th>연결 상태</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.name} className={line.sub ? 'profit-sub' : ''}>
                  <td>{line.name}</td>
                  <td>{line.need}</td>
                  <td>
                    <span className={`profit-status profit-status-${line.status}`}>
                      {statusLabel[line.status]}
                    </span>
                    {line.detail &&
                      (line.to ? (
                        <Link className="profit-detail" to={line.to}>
                          {line.detail}
                          <ArrowRight size={12} />
                        </Link>
                      ) : (
                        <span className="profit-detail">{line.detail}</span>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <>
          <div className="profit-example-note">
            <strong>예시</strong>
            작은 식당 한 달을 가정한 숫자입니다. 표시된 금액은 이 가게의 실제 자료가 아닙니다.
          </div>
          <table className="profit-table profit-example">
            <thead>
              <tr>
                <th>계정</th>
                <th className="numeric">금액</th>
                <th className="numeric">매출 대비</th>
              </tr>
            </thead>
            <tbody>
              {example.rows.map((row) => (
                <tr key={row.name} className={`profit-${row.kind}`}>
                  <td>
                    {row.name}
                    <small>
                      {row.source}
                      {'app' in row && row.app && <em>이 앱 기록</em>}
                    </small>
                  </td>
                  <td className="numeric">
                    {row.amount < 0 ? `−${won(-row.amount)}` : won(row.amount)}
                  </td>
                  <td className="numeric">
                    {row.kind === 'sub'
                      ? ''
                      : `${((row.amount / example.sales) * 100).toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
