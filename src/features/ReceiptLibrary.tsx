import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Plus, ReceiptText, Search } from 'lucide-react';
import { useSummary } from '../app/hooks';
import { useWorkspace } from '../app/WorkspaceProvider';
import { Badge, Empty, ErrorState, Loading } from '../shared/ui';
import { dateLabel, won } from '../shared/format';
import type { Receipt } from '../shared/types';
import { UploadDialog } from './UploadDialog';

const tabs = [
  ['ALL', '전체'],
  ['PROCESSING', '분석 중'],
  ['NEEDS_REVIEW', '확인 필요'],
  ['READY_TO_APPROVE', '승인 대기'],
  ['APPROVED', '확정'],
  ['FAILED', '실패'],
] as const;
export function ReceiptLibrary() {
  const workspace = useWorkspace(),
    query = useSummary();
  const [params, setParams] = useSearchParams();
  const [upload, setUpload] = useState(false);
  const filter = params.get('status') || 'ALL',
    search = params.get('q') || '',
    from = params.get('from') || '',
    to = params.get('to') || '';
  const change = (key: string, value: string) =>
    setParams(
      (old) => {
        const next = new URLSearchParams(old);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  const matches = (r: Receipt, status: string) =>
    status === 'ALL' ||
    (status === 'REVIEW'
      ? ['NEEDS_REVIEW', 'READY_TO_APPROVE'].includes(r.status)
      : status === 'PROCESSING'
        ? ['UPLOADED', 'PROCESSING'].includes(r.status)
        : r.status === status);
  const rows = [...(query.data?.recent ?? [])]
    .filter(
      (r) =>
        matches(r, filter) &&
        `${r.supplier.name} ${r.file_name}`
          .toLocaleLowerCase()
          .includes(search.trim().toLocaleLowerCase()) &&
        (!from || (!!r.purchased_at && r.purchased_at >= from)) &&
        (!to || (!!r.purchased_at && r.purchased_at <= to)),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const total = (r: Receipt) =>
    r.amounts?.total_amount ??
    (r.items.length && r.items.every((i) => i.line_total != null)
      ? r.items.reduce((n, i) => n + i.line_total!, 0)
      : null);
  return (
    <div className="page receipt-library">
      <div className="page-heading">
        <div>
          <h1>문서 · 구매</h1>
          <p>영수증을 분석하고 확인한 구매 기록을 관리합니다.</p>
        </div>
        <button className="btn primary" onClick={() => setUpload(true)}>
          <Plus size={17} />
          영수증 올리기
        </button>
      </div>
      <section className="panel library-panel">
        <div className="library-tabs" aria-label="문서 상태">
          {tabs.map(([value, label]) => (
            <button
              key={value}
              aria-pressed={filter === value}
              className={filter === value ? 'active' : ''}
              onClick={() => change('status', value)}
            >
              {label}
              <span>
                {query.data ? query.data.recent.filter((r) => matches(r, value)).length : '—'}
              </span>
            </button>
          ))}
          {filter === 'REVIEW' && (
            <button className="active" aria-pressed="true" onClick={() => change('status', 'ALL')}>
              검토할 문서 ×
            </button>
          )}
        </div>
        <div className="library-filters">
          <label className="search-field">
            <Search size={17} />
            <input
              aria-label="영수증 검색"
              value={search}
              onChange={(e) => change('q', e.target.value)}
              placeholder="거래처, 파일명 검색"
            />
          </label>
          <label className="field">
            거래일 시작
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => change('from', e.target.value)}
            />
          </label>
          <label className="field">
            거래일 종료
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => change('to', e.target.value)}
            />
          </label>
          <button className="text-link" onClick={() => setParams({}, { replace: true })}>
            초기화
          </button>
          <span className="muted text-small">{rows.length}개 문서</span>
        </div>
        {(from || to) && (
          <p className="library-date-note">거래일이 없는 문서는 날짜 필터에서 제외됩니다.</p>
        )}
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} retry={() => query.refetch()} />
        ) : !rows.length ? (
          <Empty title="조건에 맞는 문서가 없습니다">
            <p>검색 조건을 바꾸거나 영수증을 올려 주세요.</p>
          </Empty>
        ) : (
          <>
            <div className="document-table-wrap">
              <table className="document-table">
                <thead>
                  <tr>
                    <th>거래처 · 문서</th>
                    <th>거래일</th>
                    <th>문서 유형</th>
                    <th className="numeric">품목</th>
                    <th className="numeric">금액</th>
                    <th>처리 상태</th>
                    <th>열기</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.receipt_id}>
                      <td>
                        <Link
                          className="document-name"
                          to={`/receipts/${encodeURIComponent(r.receipt_id)}`}
                          state={{ returnTo: `/receipts?${params}` }}
                        >
                          <ReceiptText size={19} />
                          <span>
                            <strong>{r.supplier.name || '거래처 미확인'}</strong>
                            <small>{r.file_name}</small>
                          </span>
                        </Link>
                      </td>
                      <td>{r.purchased_at || '미확인'}</td>
                      <td>
                        {
                          {
                            RECEIPT: '영수증',
                            TRANSACTION_STATEMENT: '거래명세서',
                            DELIVERY_NOTE: '납품서',
                            UNKNOWN: '미확인',
                          }[r.document_kind]
                        }
                      </td>
                      <td className="numeric">{r.items.length}개</td>
                      <td className="numeric">{total(r) == null ? '확인 필요' : won(total(r))}</td>
                      <td>
                        <Badge status={r.status} />
                      </td>
                      <td>
                        <Link
                          className="btn small"
                          aria-label={`${r.supplier.name || r.file_name} 문서 열기`}
                          to={`/receipts/${encodeURIComponent(r.receipt_id)}`}
                          state={{ returnTo: `/receipts?${params}` }}
                        >
                          <ArrowRight size={15} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="document-mobile-list">
              {rows.map((r) => (
                <Link
                  key={r.receipt_id}
                  to={`/receipts/${encodeURIComponent(r.receipt_id)}`}
                  state={{ returnTo: `/receipts?${params}` }}
                >
                  <div>
                    <strong>{r.supplier.name || r.file_name}</strong>
                    <Badge status={r.status} />
                  </div>
                  <small>
                    {dateLabel(r.purchased_at)} · {r.items.length}개 품목
                  </small>
                  <b>{total(r) == null ? '금액 확인 필요' : won(total(r))}</b>
                </Link>
              ))}
            </div>
          </>
        )}
      </section>
      {upload && <UploadDialog room={workspace.room_id} close={() => setUpload(false)} />}
    </div>
  );
}
