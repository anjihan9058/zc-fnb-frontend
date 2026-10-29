import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  Calculator,
  FileBarChart,
  Landmark,
  ReceiptText,
  X,
} from 'lucide-react';
import { useMenuCosts, usePrices, useSummary } from '../app/hooks';
import { useWorkspace } from '../app/WorkspaceProvider';
import { WorkspaceGrid, type GridColumn } from '../features/WorkspaceGrid';
import { ProfitReport } from '../features/ProfitReport';
import { Badge, Empty, ErrorState, Loading } from '../shared/ui';
import { today, won } from '../shared/format';
import type { Receipt, Purchase } from '../shared/types';
import type { MenuCost } from '../shared/operations';

export function DashboardSelector({ value }: { value: 'operations' | 'financial' }) {
  const navigate = useNavigate();
  return (
    <select
      className="dashboard-selector"
      aria-label="대시보드 선택"
      value={value}
      onChange={(e) =>
        navigate(e.target.value === 'financial' ? '/dashboard/financial' : '/dashboard')
      }
    >
      <option value="operations">운영 개요</option>
      <option value="financial">재무 현황</option>
    </select>
  );
}
const documentTotal = (r: Receipt) =>
  r.amounts?.total_amount ??
  (r.items.length && r.items.every((i) => i.line_total != null)
    ? r.items.reduce((n, i) => n + i.line_total!, 0)
    : null);

export function AccountingPage() {
  const summary = useSummary(),
    prices = usePrices();
  const [view, setView] = useState('ALL'),
    [id, setId] = useState<string | null>(null);
  const all = summary.data?.recent ?? [],
    selected = all.find((r) => r.receipt_id === id);
  const rows = all.filter(
    (r) =>
      view === 'ALL' ||
      (view === 'REVIEW'
        ? ['NEEDS_REVIEW', 'READY_TO_APPROVE'].includes(r.status)
        : r.status === view),
  );
  const columns: GridColumn<Receipt>[] = [
    {
      key: 'supplier',
      label: '거래처 · 문서',
      render: (r) => (
        <span className="grid-document-name">
          <strong>{r.supplier.name || '거래처 미확인'}</strong>
          <small>{r.file_name}</small>
        </span>
      ),
      sort: (a, b) => a.supplier.name.localeCompare(b.supplier.name),
    },
    {
      key: 'date',
      label: '문서일',
      render: (r) => r.purchased_at || '미확인',
      sort: (a, b) => (a.purchased_at ?? '').localeCompare(b.purchased_at ?? ''),
    },
    {
      key: 'amount',
      label: '문서 금액',
      numeric: true,
      render: (r) => (documentTotal(r) == null ? '미확인' : won(documentTotal(r))),
    },
    { key: 'items', label: '품목 수', numeric: true, render: (r) => `${r.items.length}개` },
    { key: 'status', label: '구매 검토 상태', render: (r) => <Badge status={r.status} /> },
    {
      key: 'payment',
      label: '지급 정보',
      render: () => <span className="neutral-status">자료 미연결</span>,
    },
    {
      key: 'detail',
      label: '열기',
      render: (r) => (
        <button className="btn small" onClick={() => setId(r.receipt_id)}>
          상세
          <ArrowRight size={13} />
        </button>
      ),
    },
  ];
  return (
    <div className="page accounting-page">
      <div className="workspace-page-heading">
        <div>
          <h1>매입 업무 센터</h1>
          <p>문서 검토와 확정 구매 내역을 한곳에서 확인합니다.</p>
        </div>
        <Link className="btn primary" to="/receipts">
          문서 처리함
          <ArrowRight size={15} />
        </Link>
      </div>
      <div className="accounting-overview">
        <article>
          <small>접수 문서</small>
          <strong>{summary.data ? `${all.length}건` : '—'}</strong>
        </article>
        <article>
          <small>검토 · 승인 대기</small>
          <strong>
            {summary.data
              ? `${all.filter((r) => ['NEEDS_REVIEW', 'READY_TO_APPROVE'].includes(r.status)).length}건`
              : '—'}
          </strong>
        </article>
        <article>
          <small>확정 구매금액</small>
          <strong>
            {prices.data
              ? won(prices.data.reduce((n, p) => n + p.quantity * p.unit_price, 0))
              : '—'}
          </strong>
          <small>확정 구매 품목 기준 · 전체 기간</small>
        </article>
        <article className="accounting-payment-note">
          <small>지급 · 회계 기표</small>
          <strong>연결 준비</strong>
          <small>문서 승인과 별도로 관리합니다.</small>
        </article>
      </div>
      {(summary.error || prices.error) && (
        <ErrorState
          error={summary.error || prices.error}
          retry={() => {
            summary.refetch();
            prices.refetch();
          }}
        />
      )}
      <div className={`bank-workspace ${selected ? 'has-detail' : ''}`}>
        <section className="panel workspace-records">
          <div className="workspace-view-tabs">
            {[
              ['ALL', '전체 문서'],
              ['REVIEW', '검토 대기'],
              ['APPROVED', '확정 구매'],
              ['FAILED', '분석 실패'],
            ].map(([key, label]) => (
              <button
                key={key}
                className={view === key ? 'active' : ''}
                aria-pressed={view === key}
                onClick={() => setView(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {summary.isPending ? (
            <Loading />
          ) : (
            <WorkspaceGrid
              key={view}
              rows={rows}
              columns={columns}
              getId={(r) => r.receipt_id}
              searchText={(r) => `${r.supplier.name} ${r.file_name} ${r.purchased_at}`}
              selectedId={id ?? undefined}
              onSelect={(r) => setId(r.receipt_id)}
            />
          )}
        </section>
        {selected && (
          <aside className="record-sidesheet" aria-label="매입 문서 상세">
            <header>
              <div>
                <small>매입 문서</small>
                <h2>{selected.supplier.name || '거래처 미확인'}</h2>
              </div>
              <button className="icon-btn" aria-label="매입 상세 닫기" onClick={() => setId(null)}>
                <X size={18} />
              </button>
            </header>
            <div className="sidesheet-body">
              <Badge status={selected.status} />
              <dl className="record-details">
                <div>
                  <dt>파일</dt>
                  <dd>{selected.file_name}</dd>
                </div>
                <div>
                  <dt>거래일</dt>
                  <dd>{selected.purchased_at || '미확인'}</dd>
                </div>
                <div>
                  <dt>금액</dt>
                  <dd>
                    {documentTotal(selected) == null ? '미확인' : won(documentTotal(selected))}
                  </dd>
                </div>
                <div>
                  <dt>지급 내역</dt>
                  <dd>연결된 자료 없음</dd>
                </div>
                <div>
                  <dt>회계 전표</dt>
                  <dd>연결된 자료 없음</dd>
                </div>
              </dl>
              <p className="workspace-context-note">
                구매 검토가 완료되어도 실제 지급이나 회계 기표가 완료된 것은 아닙니다.
              </p>
              <h3>추출 품목</h3>
              <div className="sidesheet-items">
                {selected.items.map((item) => (
                  <div key={item.id}>
                    <span>{item.normalized_name || item.raw_name}</span>
                    <b>{won(item.line_total)}</b>
                  </div>
                ))}
              </div>
            </div>
            <footer className="sidesheet-footer">
              <Link
                className="btn primary full"
                to={`/receipts/${selected.receipt_id}`}
                state={{ returnTo: '/accounting' }}
              >
                원본 · OCR 검토
                <ArrowRight size={14} />
              </Link>
            </footer>
          </aside>
        )}
      </div>
    </div>
  );
}

export function FinancialDashboardPage() {
  const workspace = useWorkspace(),
    prices = usePrices(),
    summary = useSummary();
  const date = today(),
    monthly = prices.data?.filter(
      (p) => p.purchased_at >= `${date.slice(0, 7)}-01` && p.purchased_at <= date,
    );
  return (
    <div className="page financial-dashboard">
      <header className="overview-header">
        <div className="overview-title">
          <span className="overview-store">{workspace.name}</span>
          <h1>{Number(date.slice(5, 7))}월 재무 현황</h1>
        </div>
        <div className="overview-controls">
          <DashboardSelector value="financial" />
        </div>
      </header>
      <div className="finance-shortcuts">
        {[
          { name: '손익 보고서', to: '/reports?view=profit', icon: FileBarChart },
          { name: '매입 업무', to: '/accounting', icon: ReceiptText },
          { name: '메뉴 원가', to: '/menus', icon: Calculator },
          { name: '은행 거래', to: '/banking', icon: Landmark },
        ].map(({ name, to, icon: Icon }) => (
          <Link to={to} key={to}>
            <Icon size={28} />
            <span>{name}</span>
            <ArrowRight size={14} />
          </Link>
        ))}
      </div>
      <div className="finance-kpis">
        <article>
          <h2>매출</h2>
          <strong>—</strong>
          <p>매출 자료 연결 후 표시</p>
        </article>
        <article>
          <h2>매장 손익</h2>
          <strong>—</strong>
          <p>회계 장부 연결 후 표시</p>
        </article>
        <article>
          <h2>이번 달 확정 구매</h2>
          <strong>
            {monthly ? won(monthly.reduce((n, p) => n + p.quantity * p.unit_price, 0)) : '—'}
          </strong>
          <p>재고 사용 원가·손익과는 별도입니다.</p>
        </article>
        <article>
          <h2>은행 대사</h2>
          <strong>미연결</strong>
          <p>계좌·장부 연결 후 표시</p>
        </article>
      </div>
      {(prices.error || summary.error) && (
        <ErrorState
          error={prices.error || summary.error}
          retry={() => {
            prices.refetch();
            summary.refetch();
          }}
        />
      )}
      <div className="home-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>처리할 매입 문서</h2>
            <Link className="text-link" to="/accounting">
              업무 센터
              <ArrowRight size={14} />
            </Link>
          </div>
          <div className="finance-readiness">
            <span>검토 · 승인 대기</span>
            <strong>
              {summary.data
                ? `${summary.data.recent.filter((r) => ['NEEDS_REVIEW', 'READY_TO_APPROVE'].includes(r.status)).length}건`
                : '—'}
            </strong>
            <Link className="btn" to="/receipts?status=REVIEW">
              문서 확인
            </Link>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>재무 자료 연결</h2>
          </div>
          <div className="finance-connections">
            <Link to="/banking">
              <Landmark size={18} />
              <div>
                <strong>은행 거래 · 증빙 매칭</strong>
                <small>계좌 연결 상태와 거래 검토</small>
              </div>
              <ArrowRight size={15} />
            </Link>
            <Link to="/reports?view=profit">
              <Building2 size={18} />
              <div>
                <strong>회계 장부 · 손익</strong>
                <small>구매·지급·기표를 구분해 관리</small>
              </div>
              <ArrowRight size={15} />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

export function ReportsPage() {
  const prices = usePrices(),
    menus = useMenuCosts(),
    workspace = useWorkspace(),
    [params, setParams] = useSearchParams();
  const view = params.get('view') || 'purchase';
  const [from, setFrom] = useState(`${today().slice(0, 7)}-01`),
    [to, setTo] = useState(today());
  const purchases =
    prices.data?.filter(
      (p) => (!from || p.purchased_at >= from) && (!to || p.purchased_at <= to),
    ) ?? [];
  const purchaseColumns: GridColumn<Purchase>[] = [
    {
      key: 'date',
      label: '거래일',
      render: (r) => r.purchased_at,
      sort: (a, b) => a.purchased_at.localeCompare(b.purchased_at),
    },
    { key: 'name', label: '식재료', render: (r) => r.name },
    { key: 'supplier', label: '거래처', render: (r) => r.supplier },
    { key: 'quantity', label: '수량', numeric: true, render: (r) => `${r.quantity} ${r.unit}` },
    { key: 'price', label: '확정 단가', numeric: true, render: (r) => won(r.unit_price) },
    {
      key: 'amount',
      label: '구매금액',
      numeric: true,
      render: (r) => won(r.quantity * r.unit_price),
    },
    {
      key: 'source',
      label: '근거',
      render: (r) => (
        <Link className="text-link" to={`/receipts/${r.receipt_id}`}>
          영수증
          <ArrowRight size={12} />
        </Link>
      ),
    },
  ];
  const menuColumns: GridColumn<MenuCost>[] = [
    {
      key: 'name',
      label: '메뉴',
      render: (r) => (
        <Link className="text-link" to={`/menus?menu=${r.menu.id}`}>
          {r.menu.name}
        </Link>
      ),
      sort: (a, b) => a.menu.name.localeCompare(b.menu.name),
    },
    { key: 'price', label: '판매가격', numeric: true, render: (r) => won(r.menu.selling_price) },
    {
      key: 'cost',
      label: '식재료 원가',
      numeric: true,
      render: (r) => (r.ingredient_cost == null ? '미확인' : won(Math.round(r.ingredient_cost))),
    },
    {
      key: 'rate',
      label: '원가율',
      numeric: true,
      render: (r) => (r.cost_rate == null ? '계산 대기' : `${r.cost_rate.toFixed(1)}%`),
    },
    {
      key: 'margin',
      label: '예상 식재료 마진율',
      numeric: true,
      render: (r) => (r.margin_rate == null ? '계산 대기' : `${r.margin_rate.toFixed(1)}%`),
    },
    { key: 'status', label: '확인할 내용', render: (r) => r.issues.join(' · ') || '설정 완료' },
  ];
  return (
    <div className="page reports-page">
      <div className="workspace-page-heading">
        <div>
          <h1>보고서</h1>
          <p>구매 기록과 현재 레시피 원가를 확인합니다.</p>
        </div>
      </div>
      <div className="report-workspace">
        <aside className="report-parameters">
          <h2>보고서 조건</h2>
          <label className="field">
            보고서
            <select
              value={view}
              onChange={(e) => setParams({ view: e.target.value }, { replace: true })}
            >
              <option value="purchase">확정 구매 내역</option>
              <option value="cost">메뉴 · 원가 분석</option>
              <option value="profit">손익 보고서</option>
            </select>
          </label>
          <label className="field">
            사업장
            <input readOnly value={workspace.name} />
          </label>
          <div className="report-date-range">
            <label className="field">
              시작일
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="field">
              종료일
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
          <p className="muted">
            {view === 'cost'
              ? '원가 분석은 기간과 관계없이 현재 레시피·최근 확정 단가를 표시합니다.'
              : '기간은 구매 거래일 기준입니다.'}
          </p>
        </aside>
        <section className="panel report-output">
          <div className="panel-heading">
            <div>
              <h2>
                {view === 'cost'
                  ? '메뉴 · 원가 분석'
                  : view === 'profit'
                    ? '손익 보고서'
                    : '확정 구매 내역'}
              </h2>
              <p className="muted text-small">
                {workspace.name} ·{' '}
                {view === 'cost' ? '현재 레시피 기준' : `${from || '전체'} ~ ${to || '전체'}`}
              </p>
            </div>
          </div>
          {view === 'profit' ? (
            <ProfitReport from={from} to={to} />
          ) : view === 'cost' ? (
            menus.isPending ? (
              <Loading />
            ) : menus.error ? (
              <ErrorState error={menus.error} retry={() => menus.refetch()} />
            ) : (
              <>
                <WorkspaceGrid
                  key="cost"
                  rows={menus.data ?? []}
                  columns={menuColumns}
                  getId={(r) => r.menu.id}
                  searchText={(r) => r.menu.name}
                />
                <p className="report-basis-note">
                  판매량·재고 실사·폐기 자료가 없는 현재 보고서는 예상 식재료 원가입니다. 실제 사용
                  원가·매장 순이익은 포함하지 않습니다.
                </p>
              </>
            )
          ) : prices.isPending ? (
            <Loading />
          ) : prices.error ? (
            <ErrorState error={prices.error} retry={() => prices.refetch()} />
          ) : (
            <>
              <WorkspaceGrid
                key={`${from}-${to}`}
                rows={purchases}
                columns={purchaseColumns}
                getId={(r) => r.id}
                searchText={(r) => `${r.name} ${r.supplier} ${r.purchased_at}`}
              />
              <div className="report-total">
                <span>확정 구매 합계</span>
                <strong>{won(purchases.reduce((n, p) => n + p.quantity * p.unit_price, 0))}</strong>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
