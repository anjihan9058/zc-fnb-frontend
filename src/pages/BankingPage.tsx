import { useState } from 'react';
import { Check, ChevronDown, Landmark, Link2, RefreshCw, Unlink, X } from 'lucide-react';
import { WorkspaceGrid, type GridColumn } from '../features/WorkspaceGrid';
import {
  matchPreview,
  previewBankRows,
  previewPaymentRows,
  type PreviewBankRow,
} from '../shared/bankPreview';
import { won } from '../shared/format';
import { Modal } from '../shared/ui';
export function BankingPage() {
  const [demo, setDemo] = useState(false),
    [rows, setRows] = useState<PreviewBankRow[]>([]),
    [view, setView] = useState('ALL'),
    [selected, setSelected] = useState<string | null>(null),
    [candidate, setCandidate] = useState(''),
    [review, setReview] = useState(false),
    [connection, setConnection] = useState(false);
  const row = rows.find((row) => row.id === selected),
    payment = previewPaymentRows.find((p) => p.id === candidate);
  const remaining = row ? Math.abs(row.amount) - (payment?.amount ?? 0) : null;
  function open(row: PreviewBankRow) {
    setSelected(row.id);
    setCandidate('');
    setReview(false);
  }
  function patch(value: Partial<PreviewBankRow>) {
    setRows((old) => old.map((item) => (item.id === selected ? { ...item, ...value } : item)));
    setCandidate('');
    setReview(false);
  }
  const columns: GridColumn<PreviewBankRow>[] = [
    {
      key: 'date',
      label: '거래일',
      render: (r) => r.date,
      sort: (a, b) => a.date.localeCompare(b.date),
    },
    {
      key: 'amount',
      label: '금액',
      numeric: true,
      render: (r) => (
        <span className={r.amount < 0 ? '' : 'bank-deposit'}>
          {r.amount < 0 ? `(${won(-r.amount)})` : won(r.amount)}
        </span>
      ),
      sort: (a, b) => a.amount - b.amount,
    },
    {
      key: 'name',
      label: '은행 거래명',
      render: (r) => r.name,
      sort: (a, b) => a.name.localeCompare(b.name),
    },
    { key: 'type', label: '구분', render: (r) => (r.amount < 0 ? '출금' : '입금') },
    { key: 'note', label: '은행 적요', render: (r) => r.note },
    {
      key: 'status',
      label: '상태',
      render: (r) => (
        <span className={`bank-state bank-${r.status}`}>
          {r.status === 'MATCHED' ? '연결 완료' : r.status === 'EXCLUDED' ? '제외' : '미연결'}
        </span>
      ),
    },
    {
      key: 'action',
      label: '확인',
      render: (r) => (
        <button className="btn small" onClick={() => open(r)}>
          {r.status === 'MATCHED' ? '연결 내역' : '거래 검토'}
          <Link2 size={13} />
        </button>
      ),
    },
  ];
  return (
    <div className="page bank-page">
      <div className="workspace-page-heading">
        <div>
          <h1>은행 거래</h1>
          <label className="bank-account-picker">
            은행 계좌
            <select value={demo ? 'sample' : ''} onChange={() => setConnection(true)}>
              <option value="">연결된 계좌 없음</option>
              {demo && <option value="sample">샘플 주거래 계좌 · ****1111</option>}
            </select>
          </label>
        </div>
        <div className="home-actions">
          <button className="btn" onClick={() => setConnection(true)}>
            <Landmark size={16} />
            계좌 연결 관리
          </button>
          <button className="btn primary" onClick={() => setConnection(true)}>
            <RefreshCw size={15} />
            거래 불러오기
            <ChevronDown size={13} />
          </button>
        </div>
      </div>
      <div className="workspace-context-note">
        {demo
          ? '화면 체험용 샘플 · 실제 계좌와 연결되지 않습니다. 새로고침하면 초기화됩니다.'
          : '계좌를 연결하면 수집한 거래와 증빙을 한곳에서 확인할 수 있습니다.'}
        {!demo && (
          <button
            className="text-link"
            onClick={() => {
              setDemo(true);
              setRows(structuredClone(previewBankRows));
            }}
          >
            샘플 거래로 화면 보기
          </button>
        )}
      </div>
      <div className={`bank-workspace ${row ? 'has-detail' : ''}`}>
        <section className="panel workspace-records">
          <div className="workspace-view-tabs">
            {[
              ['ALL', '전체'],
              ['UNMATCHED', '미연결'],
              ['MATCHED', '연결 완료'],
              ['EXCLUDED', '제외'],
            ].map(([key, label]) => (
              <button
                key={key}
                className={view === key ? 'active' : ''}
                aria-pressed={view === key}
                onClick={() => setView(key)}
              >
                {label}
                <span>
                  {demo ? rows.filter((r) => key === 'ALL' || r.status === key).length : '—'}
                </span>
              </button>
            ))}
          </div>
          <WorkspaceGrid
            key={view}
            rows={rows.filter((r) => view === 'ALL' || r.status === view)}
            columns={columns}
            getId={(r) => r.id}
            searchText={(r) => `${r.date} ${r.name} ${r.note}`}
            selectedId={selected ?? undefined}
            onSelect={open}
            empty={demo ? '이 보기에 해당하는 거래가 없습니다' : '아직 연결된 은행 거래가 없습니다'}
          />
        </section>
        {row && (
          <aside className="record-sidesheet" aria-label="은행 거래 검토">
            <header>
              <div>
                <small>선택한 거래 1건</small>
                <h2>거래 연결</h2>
              </div>
              <button
                className="icon-btn"
                aria-label="거래 검토 닫기"
                onClick={() => setSelected(null)}
              >
                <X size={18} />
              </button>
            </header>
            <div className="sidesheet-tabs">
              <button className={!review ? 'active' : ''} onClick={() => setReview(false)}>
                후보 찾기
              </button>
              <button
                className={review ? 'active' : ''}
                disabled={!candidate && row.status !== 'MATCHED'}
                onClick={() => setReview(true)}
              >
                연결 요약
              </button>
            </div>
            <div className="sidesheet-body">
              <div className="selected-bank-summary">
                <strong>{row.name}</strong>
                <span>{row.date}</span>
                <b>{won(row.amount)}</b>
                <small>{row.note}</small>
              </div>
              {row.status === 'MATCHED' ? (
                <div className="linked-payment">
                  <Check size={20} />
                  <h3>샘플 지급 기록에 연결됨</h3>
                  <p>{previewPaymentRows.find((p) => p.id === row.matchedId)?.number}</p>
                  <button
                    className="btn"
                    onClick={() => patch({ status: 'UNMATCHED', matchedId: undefined })}
                  >
                    <Unlink size={14} />
                    연결 해제
                  </button>
                </div>
              ) : row.status === 'EXCLUDED' ? (
                <>
                  <p>검토 대상에서 제외된 거래입니다.</p>
                  <button className="btn" onClick={() => patch({ status: 'UNMATCHED' })}>
                    미연결로 되돌리기
                  </button>
                </>
              ) : review && payment ? (
                <div className="match-review">
                  <h3>연결할 지급 기록</h3>
                  <strong>{payment.name}</strong>
                  <p>
                    {payment.number} · {payment.date}
                  </p>
                  <b>{won(payment.amount)}</b>
                  <p className="muted">
                    샘플 연결 상태만 변경하며 실제 지급·장부에는 반영하지 않습니다.
                  </p>
                </div>
              ) : (
                <>
                  <h3>지급 기록 후보</h3>
                  {row.amount < 0 ? (
                    previewPaymentRows.map((p) => (
                      <label className="payment-candidate" key={p.id}>
                        <input
                          type="radio"
                          name="payment-candidate"
                          value={p.id}
                          checked={candidate === p.id}
                          onChange={() => setCandidate(p.id)}
                        />
                        <span>
                          <strong>{p.name}</strong>
                          <small>
                            {p.number} · {p.date}
                          </small>
                        </span>
                        <b>{won(p.amount)}</b>
                      </label>
                    ))
                  ) : (
                    <p className="muted">
                      입금 거래는 매출·수납 자료가 연결된 뒤 검토할 수 있습니다.
                    </p>
                  )}
                </>
              )}
            </div>
            <footer className="sidesheet-footer">
              {row.status === 'UNMATCHED' && (
                <>
                  <div>
                    <span>연결 후 남는 차액</span>
                    <strong>{remaining == null ? '—' : won(remaining)}</strong>
                  </div>
                  <div className="home-actions">
                    <button className="btn" onClick={() => patch({ status: 'EXCLUDED' })}>
                      제외
                    </button>
                    <button
                      className="btn primary"
                      disabled={!candidate || remaining !== 0 || row.amount >= 0}
                      onClick={() => {
                        if (!review) setReview(true);
                        else {
                          setRows((old) =>
                            old.map((item) =>
                              item.id === row.id ? matchPreview(item, candidate) : item,
                            ),
                          );
                          setReview(false);
                          setCandidate('');
                        }
                      }}
                    >
                      {review ? '샘플 연결 확정' : '연결 검토'}
                    </button>
                  </div>
                </>
              )}
            </footer>
          </aside>
        )}
      </div>
      {connection && (
        <Modal title="은행 계좌 연결" close={() => setConnection(false)}>
          <div className="connection-empty">
            <Landmark size={34} />
            <h3>실제 계좌 연결 준비 중</h3>
            <p>
              은행 거래 조회를 사용하려면 지원 금융기관과 연결 서비스를 먼저 설정해야 합니다. 현재는
              실제 계좌에 접속하지 않습니다.
            </p>
            <button
              className="btn primary"
              onClick={() => {
                setDemo(true);
                setRows(structuredClone(previewBankRows));
                setSelected(null);
                setView('ALL');
                setConnection(false);
              }}
            >
              샘플 화면 살펴보기
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
