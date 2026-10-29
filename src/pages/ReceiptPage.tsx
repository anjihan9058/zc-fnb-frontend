import { useWorkspace } from '../app/WorkspaceProvider';
import { createId } from '../shared/id';
import { confirmDiscard, safeReturnTo } from '../shared/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  FileSearch,
  FileText,
  Maximize2,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { z } from 'zod';
import { api, isDemo } from '../shared/api';
import { useProducts, useReceipt, useRefresh, useSummary } from '../app/hooks';
import { Badge, Empty, ErrorState, Loading, Modal, ResourceError, useToast } from '../shared/ui';
import { dateLabel, statuses, warnings, won } from '../shared/format';
import type {
  DocumentKind,
  InputStyle,
  ItemPatch,
  Product,
  Receipt,
  ReceiptItem,
  Summary,
} from '../shared/types';
import { UploadDialog } from '../features/UploadDialog';
import { ReceiptItemsTable } from '../features/ReceiptItemsTable';
const kindLabels: Record<DocumentKind, string> = {
  RECEIPT: '영수증',
  TRANSACTION_STATEMENT: '거래명세서',
  DELIVERY_NOTE: '검수·납품 명세서',
  UNKNOWN: '미분류',
};
const styleLabels: Record<InputStyle, string> = {
  HANDWRITTEN: '수기',
  PRINTED: '인쇄형',
  DIGITAL: '전자문서',
  MIXED: '혼합형',
  UNKNOWN: '미확인',
};
export { ReceiptLibrary as ReceiptsPage } from '../features/ReceiptLibrary';
export function ReceiptReviewPage() {
  const client = useQueryClient();
  const location = useLocation();
  const returnTo = location.state?.returnTo ? safeReturnTo(location.state.returnTo) : '/receipts';
  const { receiptId = '' } = useParams();
  const query = useReceipt(receiptId);
  const products = useProducts();
  const refresh = useRefresh();
  const toast = useToast();
  const [editing, setEditing] = useState<ReceiptItem | null>(null);
  const [meta, setMeta] = useState(false);
  const [source, setSource] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [tab, setTab] = useState<'all' | 'info' | 'items' | 'history'>('all');
  const [itemFilter, setItemFilter] = useState<'all' | 'problems' | 'unmatched'>('all');
  const [mobileView, setMobileView] = useState<'content' | 'source'>('content');
  useEffect(() => {
    setEditing(null);
    setMeta(false);
    setSource(false);
    setConfirm(false);
    setTab('all');
    setItemFilter('all');
    setMobileView('content');
  }, [receiptId]);
  const approvalKey = useMemo(() => createId(), [receiptId, query.data?.version]);
  const approve = useMutation({
    mutationFn: async () => {
      await api.approve(receiptId, query.data!.version, approvalKey);
      const r = await api.receipt(receiptId);
      if (r.status !== 'APPROVED')
        throw new Error('서버가 아직 승인을 완료하지 않았습니다. 상태를 다시 확인해 주세요.');
      return r;
    },
    onSuccess: async () => {
      setConfirm(false);
      await refresh();
      toast('승인된 구매가격이 가격 이력에 반영되었습니다.');
    },
    onError: () => query.refetch(),
  });
  const retry = useMutation({
    mutationFn: () => api.retry(receiptId),
    onSuccess: async () => {
      await refresh();
      toast('분석을 다시 요청했습니다.');
    },
  });
  if (query.isPending) return <Loading />;
  if (!query.data)
    return (
      <ResourceError
        error={query.error ?? new Error('영수증을 불러오지 못했습니다.')}
        retry={() => query.refetch()}
        to="/receipts"
        label="영수증 목록으로 돌아가기"
      />
    );
  const r = query.data;
  const locked =
    ['PROCESSING', 'UPLOADED', 'APPROVED', 'FAILED'].includes(r.status) ||
    r.capabilities?.can_edit === false;
  const problems = r.items.filter((i) => i.status === 'NEEDS_REVIEW' || i.warnings.length > 0);
  const shownItems = [...r.items]
    .sort((a, b) => Number(problems.includes(b)) - Number(problems.includes(a)))
    .filter(
      (i) =>
        itemFilter === 'all' || (itemFilter === 'unmatched' ? !i.product_id : problems.includes(i)),
    );
  const total =
    r.amounts?.total_amount ??
    (r.items.length && r.items.every((i) => i.line_total != null)
      ? r.items.reduce((n, i) => n + i.line_total!, 0)
      : null);
  const documents = client.getQueryData<Summary>(['summary'])?.recent ?? [];
  const documentIndex = documents.findIndex((doc) => doc.receipt_id === receiptId);
  return (
    <div
      className={`page review-page workspace-review mobile-review-${mobileView}`}
      data-pending={approve.isPending || retry.isPending}
    >
      <Link className="back-link" to={returnTo}>
        <ArrowLeft size={15} />
        문서 · 구매 목록
      </Link>
      <div className="page-heading">
        <div>
          <h1>{r.supplier.name || '새 영수증 검토'}</h1>
          <p>
            {dateLabel(r.purchased_at)} · {r.file_name}
          </p>
        </div>
        <div className="document-stepper">
          <Badge status={r.status} />
          {documentIndex > 0 && (
            <Link
              className="btn small"
              to={`/receipts/${documents[documentIndex - 1].receipt_id}`}
              state={{ returnTo }}
            >
              이전 문서
            </Link>
          )}
          {documentIndex >= 0 && documentIndex < documents.length - 1 && (
            <Link
              className="btn small"
              to={`/receipts/${documents[documentIndex + 1].receipt_id}`}
              state={{ returnTo }}
            >
              다음 문서
              <ArrowRight size={13} />
            </Link>
          )}
        </div>
      </div>
      {isDemo && (
        <div className="demo-banner">
          <SparkleIcon />
          {r.demo_scenario === 'manual'
            ? '실제 OCR이 연결되지 않았습니다. 원본을 확인하고 거래 정보와 품목을 직접 입력하세요.'
            : '가상 데이터 시연입니다. 예시 원본과 추출값은 오류 검토 과정을 체험하도록 구성했습니다.'}
        </div>
      )}
      <div className="review-summary-bar">
        <div>
          <small>문서 유형</small>
          <strong>{kindLabels[r.document_kind] || '미확인'}</strong>
        </div>
        <div>
          <small>거래일</small>
          <strong>{r.purchased_at || '미확인'}</strong>
        </div>
        <div>
          <small>{r.amounts?.total_amount != null ? '문서 총액' : '품목 합계'}</small>
          <strong>{total == null ? '확인 필요' : won(total)}</strong>
        </div>
        <div>
          <small>확인할 품목</small>
          <strong>
            {problems.length} / {r.items.length}개
          </strong>
        </div>
        <Link
          className="text-link"
          to={`/rooms/${encodeURIComponent(r.room_id)}${r.source_message_id ? `?message=${encodeURIComponent(r.source_message_id)}` : ''}`}
        >
          원문 채팅
          <ArrowRight size={14} />
        </Link>
      </div>
      <div className="mobile-review-switch" aria-label="검토 화면">
        <button aria-pressed={mobileView === 'content'} onClick={() => setMobileView('content')}>
          분석 내용
        </button>
        <button aria-pressed={mobileView === 'source'} onClick={() => setMobileView('source')}>
          원본 문서
        </button>
      </div>
      {!!r.issues?.length && (
        <div className="document-issues">
          <strong>문서에서 확인할 내용</strong>
          <ul>
            {r.issues.map((issue, index) => (
              <li key={`${issue.code}-${index}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="review-layout">
        <aside className="source-column panel">
          <div className="panel-heading">
            <h2>원본 영수증</h2>
            <button className="icon-btn" aria-label="원본 확대" onClick={() => setSource(true)}>
              <Maximize2 size={17} />
            </button>
          </div>
          <Source key={`${r.receipt_id}-${r.image_url}`} receipt={r} zoomable />
          <button className="btn full source-expand" onClick={() => setSource(true)}>
            <Maximize2 size={16} />
            크게 보기
          </button>
          <p className="text-small muted">원본의 품목·수량·단가를 함께 확인해 주세요.</p>
        </aside>
        <div className="review-content">
          <button className="btn mobile-source" onClick={() => setSource(true)}>
            <FileSearch size={18} />
            원본 영수증 보기
          </button>
          <div className="review-work-tabs" aria-label="검토 영역">
            {(
              [
                ['all', '전체 검토'],
                ['info', '문서 정보'],
                ['items', '품목'],
                ['history', '활동 이력'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                aria-pressed={tab === key}
                className={tab === key ? 'active' : ''}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'history' && (
            <section className="panel activity-panel">
              <h2>활동 이력</h2>
              {r.activity?.length ? (
                <ol>
                  {r.activity.map((event) => (
                    <li key={event.id}>
                      <strong>{event.actor}</strong>
                      <span>{event.description}</span>
                      <time>
                        {new Date(event.created_at).toLocaleString('ko-KR', {
                          timeZone: 'Asia/Seoul',
                        })}
                      </time>
                    </li>
                  ))}
                </ol>
              ) : (
                <Empty title="표시할 활동 기록이 없습니다">
                  <p>기록이 제공되면 수정·승인 내역을 여기에서 확인할 수 있습니다.</p>
                </Empty>
              )}
            </section>
          )}
          <section className="panel metadata" hidden={tab === 'items' || tab === 'history'}>
            <div className="panel-heading">
              <h2>문서 정보</h2>
              <button className="text-link" disabled={locked} onClick={() => setMeta(true)}>
                <Pencil size={14} />
                수정
              </button>
            </div>
            <dl>
              <div>
                <dt>문서 종류</dt>
                <dd>{kindLabels[r.document_kind] || '미확인'}</dd>
              </div>
              <div>
                <dt>표기 방식</dt>
                <dd>{styleLabels[r.input_style] || '미확인'}</dd>
              </div>
              <div>
                <dt>거래처</dt>
                <dd>{r.supplier.name || '미확인'}</dd>
              </div>
              <div>
                <dt>거래일</dt>
                <dd>{r.purchased_at || '미확인'}</dd>
              </div>
            </dl>
            <div className="meta-hint">
              {isDemo
                ? '문서 정보는 데모 예시 또는 직접 확인한 값입니다.'
                : 'AI가 분석한 문서 정보입니다. 원본과 다르면 수정해 주세요.'}
            </div>
          </section>
          {['UPLOADED', 'PROCESSING'].includes(r.status) ? (
            <section className="panel">
              <Loading />
              <p className="center muted">처리 상태를 자동으로 확인하고 있습니다.</p>
            </section>
          ) : r.status === 'FAILED' ? (
            <section className="panel failure-state">
              <AlertTriangle size={30} />
              <h3>분석을 완료하지 못했어요</h3>
              <p>{r.error || '원본과 네트워크 상태를 확인한 후 다시 요청해 주세요.'}</p>
              <button
                className="btn primary"
                disabled={retry.isPending}
                onClick={() => retry.mutate()}
              >
                <RotateCcw size={16} />
                {retry.isPending ? '요청 중…' : '분석 다시 시도'}
              </button>
              {retry.error && <ErrorState error={retry.error} />}
            </section>
          ) : (
            <div hidden={tab === 'info' || tab === 'history'}>
              <div className="review-section-title">
                <h2>
                  {r.status === 'APPROVED' ? '확정된 품목' : '추출된 품목'}{' '}
                  <span className="number-label">{r.items.length}</span>
                </h2>
                <span className="muted text-small">{problems.length}개 항목 확인 필요</span>
              </div>
              {problems.length > 0 && (
                <div className="review-alert">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>원본과 한 번만 비교해 주세요.</strong>
                    <p>수정한 값은 재검증을 거쳐 승인할 수 있어요.</p>
                  </div>
                </div>
              )}
              <div className="review-item-toolbar">
                <div className="segmented-control" aria-label="품목 필터">
                  {(
                    [
                      ['all', '전체'],
                      ['problems', '문제만'],
                      ['unmatched', '품목 미연결'],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      aria-pressed={itemFilter === key}
                      className={itemFilter === key ? 'active' : ''}
                      onClick={() => setItemFilter(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <span className="muted text-small">{shownItems.length}개 품목</span>
                <button
                  className="btn small"
                  disabled={locked || !problems.length}
                  onClick={() => setEditing(problems[0])}
                >
                  다음 문제
                </button>
              </div>
              <ReceiptItemsTable items={shownItems} locked={locked} edit={setEditing} />
              {!!r.items.length && !shownItems.length && (
                <Empty title="이 조건에 해당하는 품목이 없습니다">
                  <p>전체 품목을 보거나 다른 필터를 선택해 주세요.</p>
                </Empty>
              )}
              {!r.items.length && (
                <Empty title="추출된 품목이 없습니다">
                  <p>원본을 확인하고 담당자에게 문의해 주세요.</p>
                </Empty>
              )}
              <section className="approval-box">
                <div>
                  <ShieldCheck size={22} />
                  <div>
                    <strong>
                      {r.status === 'APPROVED'
                        ? '구매가격 반영 완료'
                        : '확인한 가격만 안전하게 반영해요'}
                    </strong>
                    <p>
                      {r.status === 'APPROVED'
                        ? '이 영수증의 확정 구매 기록을 가격 이력에서 확인하세요.'
                        : !r.purchased_at || !r.supplier.name
                          ? '문서 정보에서 거래처와 거래일을 입력해 주세요.'
                          : problems.length
                            ? '모든 확인 필요 항목을 수정하면 승인할 수 있습니다.'
                            : r.status === 'READY_TO_APPROVE'
                              ? '검증이 완료되었습니다. 최종 승인 후 가격에 반영됩니다.'
                              : '문서의 미확인 정보와 품목을 확인해 주세요.'}
                    </p>
                  </div>
                </div>
                {r.status === 'APPROVED' ? (
                  <Link className="btn primary" to="/prices">
                    가격 이력 보기
                    <ArrowRight size={16} />
                  </Link>
                ) : (
                  <button
                    className="btn primary"
                    disabled={
                      r.status !== 'READY_TO_APPROVE' ||
                      r.capabilities?.can_approve === false ||
                      r.issues?.some((issue) => issue.severity === 'BLOCKING') ||
                      approve.isPending ||
                      !navigator.onLine
                    }
                    onClick={() => setConfirm(true)}
                  >
                    <CheckCheck size={17} />
                    검토 완료 및 승인
                  </button>
                )}
              </section>
              {approve.error && <ErrorState error={approve.error} />}
            </div>
          )}
        </div>
      </div>
      {editing && (
        <ItemEditor
          key={editing.id}
          item={editing}
          receipt={r}
          products={products.data ?? []}
          close={() => setEditing(null)}
        />
      )}{' '}
      {meta && <MetadataEditor receipt={r} close={() => setMeta(false)} />}{' '}
      {source && (
        <Modal title="원본 영수증" close={() => setSource(false)} wide>
          <Source receipt={r} zoomable />
        </Modal>
      )}
      {confirm && (
        <Modal
          title="구매가격을 확정할까요?"
          busy={approve.isPending}
          close={() => {
            if (!approve.isPending) setConfirm(false);
          }}
        >
          <div className="confirm-icon">
            <ShieldCheck size={32} />
          </div>
          <p>
            <strong>
              {r.items.length}개 품목 · {won(r.items.reduce((a, i) => a + (i.line_total ?? 0), 0))}
            </strong>
          </p>
          <p className="muted">
            원본과 비교한 수량·단가를 구매 이력에 반영합니다. 승인된 기록은 이 화면에서 수정할 수
            없습니다.
          </p>
          {approve.error && <ErrorState error={approve.error} />}
          <div className="modal-actions">
            <button className="btn" disabled={approve.isPending} onClick={() => setConfirm(false)}>
              다시 검토
            </button>
            <button
              className="btn primary"
              disabled={approve.isPending || !navigator.onLine}
              onClick={() => approve.mutate()}
            >
              {approve.isPending ? '서버 승인 확인 중…' : '구매가격 확정'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function SparkleIcon() {
  return <ShieldCheck size={17} />;
}
const patchSchema = z.object({
  product_id: z.string().min(1, '표준 식재료를 선택해 주세요.'),
  quantity: z.number().positive('수량은 0보다 커야 합니다.'),
  unit: z.string().min(1),
  unit_price: z.number().positive('단가는 0보다 커야 합니다.').nullable(),
  line_total: z.number().positive('금액은 0보다 커야 합니다.').nullable(),
  anomaly_confirmed: z.boolean(),
});
function ItemEditor({
  item,
  receipt,
  products,
  close,
}: {
  item: ReceiptItem;
  receipt: Receipt;
  products: Product[];
  close: () => void;
}) {
  const [product, setProduct] = useState(item.product_id ?? '');
  const [quantity, setQuantity] = useState(item.quantity?.toString() ?? '');
  const [price, setPrice] = useState(item.unit_price?.toString() ?? '');
  const [total, setTotal] = useState(item.line_total?.toString() ?? '');
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const refresh = useRefresh();
  const toast = useToast();
  const selected = products.find((p) => p.id === product);
  const dirty =
    product !== (item.product_id ?? '') ||
    quantity !== (item.quantity?.toString() ?? '') ||
    price !== (item.unit_price?.toString() ?? '') ||
    total !== (item.line_total?.toString() ?? '') ||
    ack;
  const mutation = useMutation({
    mutationFn: async (patch: ItemPatch) => {
      await api.patchItem(receipt.receipt_id, item.id, patch, receipt.version);
      await api.receipt(receipt.receipt_id);
    },
    onSuccess: async () => {
      await refresh();
      toast('수정 내용을 저장하고 재검증했습니다.');
      close();
    },
    onError: () => refresh(),
  });
  function submit() {
    const parsed = patchSchema.safeParse({
      product_id: product,
      quantity: quantity === '' ? null : Number(quantity),
      unit: selected?.unit ?? item.unit,
      unit_price: price === '' ? null : Number(price),
      line_total: total === '' ? null : Number(total),
      anomaly_confirmed: ack,
    });
    if (!parsed.success) {
      setError(new Error(parsed.error.issues[0].message));
      return;
    }
    setError(null);
    mutation.mutate(parsed.data);
  }
  return (
    <Modal
      title="품목 확인 및 수정"
      dirty={dirty}
      busy={mutation.isPending}
      close={() => {
        if (!mutation.isPending) close();
      }}
    >
      <p className="muted">원문: {item.raw_name} · 원본에 없는 가격은 비워 두세요.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <fieldset disabled={mutation.isPending}>
          <label className="field">
            표준 식재료
            <select
              value={product}
              onChange={(e) => {
                setProduct(e.target.value);
                setAck(false);
              }}
              required
            >
              <option value="">식재료 선택</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} / {p.unit}
                </option>
              ))}
            </select>
          </label>
          <div className="form-grid">
            <label className="field">
              수량
              <input
                type="number"
                step="0.001"
                min="0.001"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
            <label className="field">
              비교 단위
              <input value={selected?.unit ?? item.unit} readOnly />
            </label>
            <label className="field">
              단가 (원)
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="미입력"
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value);
                  setAck(false);
                }}
              />
            </label>
            <label className="field">
              행 금액 (원)
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="미입력"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            className="text-link"
            disabled={!price || !quantity}
            onClick={() =>
              setTotal(String(Math.round(Number(price) * Number(quantity) * 100) / 100))
            }
          >
            수량 × 단가로 금액 입력
          </button>
          <label className="checkbox-label">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>원본을 확인했으며, 큰 가격 변동도 실제 거래가격입니다.</span>
          </label>
          <p className="text-small muted">
            품목을 선택하면 등록된 단위로 비교합니다. 포장 단위가 다르면 규격이 같은 품목을 먼저
            등록하세요.
          </p>
          {(error || mutation.error) && <ErrorState error={error || mutation.error} />}
          <div className="modal-actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (confirmDiscard(dirty, mutation.isPending)) close();
              }}
            >
              취소
            </button>
            <button className="btn primary">
              {mutation.isPending ? '재검증 중…' : '저장 및 재검증'}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
function MetadataEditor({ receipt: r, close }: { receipt: Receipt; close: () => void }) {
  const [kind, setKind] = useState(r.document_kind);
  const [style, setStyle] = useState(r.input_style);
  const [date, setDate] = useState(r.purchased_at ?? '');
  const [supplier, setSupplier] = useState(r.supplier.name);
  const dirty =
    kind !== r.document_kind ||
    style !== r.input_style ||
    date !== (r.purchased_at ?? '') ||
    supplier !== r.supplier.name;
  const refresh = useRefresh();
  const mutation = useMutation({
    mutationFn: () =>
      api.patchDocument(
        r.receipt_id,
        {
          document_kind: kind,
          input_style: style,
          purchased_at: date || null,
          supplier: { ...r.supplier, name: supplier.trim() },
        },
        r.version,
      ),
    onSuccess: async () => {
      await refresh();
      close();
    },
    onError: () => refresh(),
  });
  return (
    <Modal
      title="문서 정보 수정"
      dirty={dirty}
      busy={mutation.isPending}
      close={() => {
        if (!mutation.isPending) close();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <fieldset disabled={mutation.isPending}>
          <label className="field">
            거래처
            <input
              required
              maxLength={100}
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
            />
          </label>
          <label className="field">
            거래일
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div className="form-grid">
            <label className="field">
              문서 종류
              <select value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)}>
                {Object.entries(kindLabels).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              표기 방식
              <select value={style} onChange={(e) => setStyle(e.target.value as InputStyle)}>
                {Object.entries(styleLabels).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted text-small">
            분류 수정은 문서 정보를 보완합니다. OCR을 자동 재실행하지 않습니다.
          </p>
          {mutation.error && <ErrorState error={mutation.error} />}
          <div className="modal-actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (confirmDiscard(dirty, mutation.isPending)) close();
              }}
            >
              취소
            </button>
            <button className="btn primary">{mutation.isPending ? '저장 중…' : '정보 저장'}</button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
function Source({ receipt: r, zoomable = false }: { receipt: Receipt; zoomable?: boolean }) {
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState(false);
  const [imageAttempt, setImageAttempt] = useState(0);
  if (!r.image_url)
    return (
      <Empty title="원본을 준비하고 있어요">
        <p>원본 URL이 아직 제공되지 않았습니다.</p>
      </Empty>
    );
  return (
    <>
      {zoomable && (
        <div className="zoom-controls">
          <button
            className="icon-btn"
            aria-label="축소"
            onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
          >
            <ZoomOut size={19} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            className="icon-btn"
            aria-label="확대"
            onClick={() => setZoom(Math.min(3, zoom + 0.25))}
          >
            <ZoomIn size={19} />
          </button>
          <button className="text-link" onClick={() => setZoom(1)}>
            원래 크기
          </button>
        </div>
      )}
      <div className={`source-view ${zoomable ? 'large-source' : ''}`}>
        {r.file_type === 'application/pdf' ? (
          <div className="pdf-preview">
            <object
              data={r.image_url}
              type="application/pdf"
              className="pdf-document-viewer"
              aria-label="PDF 원본 미리보기"
            >
              <p>미리보기를 지원하지 않으면 아래에서 원본을 열어 주세요.</p>
            </object>
            <FileText size={40} />
            <p>PDF 문서</p>
            <a
              className="btn"
              href={r.image_url}
              download={r.file_name}
              target="_blank"
              rel="noreferrer"
            >
              PDF 원본 다운로드
              <Maximize2 size={15} />
            </a>
          </div>
        ) : failed ? (
          <Empty title="이미지를 불러오지 못했습니다">
            <button
              className="btn"
              onClick={() => {
                setFailed(false);
                setImageAttempt((v) => v + 1);
              }}
            >
              다시 불러오기
            </button>
          </Empty>
        ) : (
          <img
            key={imageAttempt}
            src={r.image_url}
            alt={`${r.supplier.name || '업로드한'} 영수증 원본`}
            onError={() => setFailed(true)}
            style={zoomable ? { width: `${zoom * 100}%`, maxWidth: 'none' } : undefined}
          />
        )}
      </div>
    </>
  );
}
