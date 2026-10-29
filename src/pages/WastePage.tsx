import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Info, Plus, Trash2 } from 'lucide-react';
import { usePrices, useProducts, useRefresh, useWasteRecords } from '../app/hooks';
import { wasteApi } from '../shared/api';
import { today, won } from '../shared/format';
import { recipeUnits } from '../shared/units';
import {
  wasteLoss,
  wasteReasons,
  type WasteInput,
  type WasteReason,
  type WasteRecord,
} from '../shared/waste';
import { Empty, ErrorState, Loading, Modal, useToast } from '../shared/ui';
import { WorkspaceGrid, type GridColumn } from '../features/WorkspaceGrid';
import type { Product, Purchase } from '../shared/types';

type Draft = Omit<WasteInput, 'quantity'> & { quantity: string };
type Row = WasteRecord & { loss: ReturnType<typeof wasteLoss> };

const shortDate = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;
const blank = (): Draft => ({
  wasted_on: today(),
  product_id: '',
  quantity: '',
  unit: '',
  reason: 'EXPIRED',
  note: '',
});

export function WastePage() {
  const records = useWasteRecords(),
    prices = usePrices(),
    products = useProducts();
  const [params, setParams] = useSearchParams();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [reason, setReason] = useState<'ALL' | WasteReason>('ALL');
  const [editing, setEditing] = useState<Draft | null>(null);
  useEffect(() => {
    if (!params.get('new')) return;
    setEditing(blank());
    setParams(
      (old) => {
        const next = new URLSearchParams(old);
        next.delete('new');
        return next;
      },
      { replace: true },
    );
  }, [params, setParams]);

  const rows: Row[] = (records.data ?? [])
    .filter(
      (r) => (!month || r.wasted_on.startsWith(month)) && (reason === 'ALL' || r.reason === reason),
    )
    .map((r) => ({ ...r, loss: wasteLoss(r, prices.data ?? []) }));
  const total = rows.reduce((sum, r) => sum + (r.loss?.amount ?? 0), 0);
  const unpriced = rows.filter((r) => !r.loss).length;
  const byItem = [
    ...rows
      .reduce(
        (map, r) => map.set(r.name, (map.get(r.name) ?? 0) + (r.loss?.amount ?? 0)),
        new Map<string, number>(),
      )
      .entries(),
  ].sort((a, b) => b[1] - a[1]);
  const top = byItem[0] && byItem[0][1] > 0 ? byItem[0] : null;
  const period = month ? `${Number(month.slice(5, 7))}월` : '전체 기간';

  const columns: GridColumn<Row>[] = [
    {
      key: 'date',
      label: '폐기일',
      render: (r) => shortDate(r.wasted_on),
      sort: (a, b) => a.wasted_on.localeCompare(b.wasted_on),
    },
    {
      key: 'name',
      label: '식재료',
      render: (r) => <strong>{r.name}</strong>,
      sort: (a, b) => a.name.localeCompare(b.name),
    },
    {
      key: 'quantity',
      label: '수량',
      numeric: true,
      render: (r) => `${r.quantity} ${r.unit}`,
    },
    {
      key: 'reason',
      label: '사유',
      render: (r) => (
        <span className="waste-reason">
          {wasteReasons[r.reason]}
          {r.note && <small>{r.note}</small>}
        </span>
      ),
    },
    {
      key: 'loss',
      label: '추정 손실',
      numeric: true,
      render: (r) => (r.loss ? won(r.loss.amount) : <span className="muted">단가 없음</span>),
      sort: (a, b) => (a.loss?.amount ?? -1) - (b.loss?.amount ?? -1),
    },
    { key: 'by', label: '기록자', render: (r) => r.recorded_by },
  ];
  const edit = (r: WasteRecord) =>
    setEditing({
      id: r.id,
      version: r.version,
      wasted_on: r.wasted_on,
      product_id: r.product_id,
      quantity: String(r.quantity),
      unit: r.unit,
      reason: r.reason,
      note: r.note,
    });

  return (
    <div className="page waste-page">
      <div className="page-heading">
        <div>
          <h1>폐기 기록</h1>
          <p>버린 식재료와 사유를 남기면 확정 구매단가로 손실 금액을 추정합니다.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing(blank())}>
          <Plus size={16} />
          폐기 기록
        </button>
      </div>
      <div className="operations-stats">
        <div>
          <span>{period} 폐기</span>
          <strong>{records.data ? `${rows.length}건` : '—'}</strong>
        </div>
        <div>
          <span>추정 손실</span>
          <strong>{records.data && prices.data ? won(total) : '—'}</strong>
          {unpriced > 0 && <small>단가 없는 {unpriced}건 제외</small>}
        </div>
        <div>
          <span>가장 큰 손실</span>
          <strong>{top ? top[0] : '—'}</strong>
          {top && <small>{won(top[1])}</small>}
        </div>
      </div>
      <div className="operations-filter">
        <label className="field">
          기간
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <label className="field">
          사유
          <select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
            <option value="ALL">전체</option>
            {Object.entries(wasteReasons).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <section className="panel workspace-records">
        {(records.isPending || prices.isPending) && <Loading />}
        {(records.error || prices.error) && (
          <ErrorState
            error={records.error || prices.error}
            retry={() => {
              records.refetch();
              prices.refetch();
            }}
          />
        )}
        {records.data && prices.data && !rows.length && (
          <Empty
            title={
              records.data.length ? '이 조건의 폐기 기록이 없습니다' : '아직 폐기 기록이 없습니다'
            }
          >
            <p>유통기한이 지나거나 상해서 버린 식재료가 생기면 바로 기록하세요.</p>
            <button className="btn" onClick={() => setEditing(blank())}>
              <Plus size={16} />
              폐기 기록
            </button>
          </Empty>
        )}
        {!!rows.length && (
          <WorkspaceGrid
            key={`${month}-${reason}`}
            rows={rows}
            columns={columns}
            getId={(r) => r.id}
            searchText={(r) => `${r.name} ${wasteReasons[r.reason]} ${r.note} ${r.recorded_by}`}
            onSelect={edit}
          />
        )}
      </section>
      <p className="waste-basis">
        <Info size={14} />
        <span>
          추정 손실은 폐기 수량 × 폐기일 이전 최근 확정 구매단가입니다. 메뉴의 예상 원가율에는 넣지
          않으며, 매출·재고 자료가 연결되면 손익 보고서의 매출원가 설명에 쓰입니다.
        </span>
      </p>
      {editing && (
        <WasteEditor
          initial={editing}
          products={products.data ?? []}
          purchases={prices.data ?? []}
          close={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function WasteEditor({
  initial,
  products,
  purchases,
  close,
}: {
  initial: Draft;
  products: Product[];
  purchases: Purchase[];
  close: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const refresh = useRefresh(),
    toast = useToast();
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const product = products.find((p) => p.id === draft.product_id);
  const units = product ? recipeUnits(product.unit) : [];
  const quantity = Number(draft.quantity);
  const loss =
    product && draft.quantity !== '' && quantity > 0 && draft.unit
      ? wasteLoss({ ...draft, quantity }, purchases)
      : undefined;
  const save = useMutation({
    mutationFn: () => wasteApi.save({ ...draft, quantity }),
    onSuccess: async () => {
      await refresh();
      toast(initial.id ? '폐기 기록을 수정했습니다.' : '폐기 기록을 저장했습니다.');
      close();
    },
  });
  const remove = useMutation({
    mutationFn: () => wasteApi.remove(initial.id!, initial.version!),
    onSuccess: async () => {
      await refresh();
      toast('폐기 기록을 삭제했습니다.');
      close();
    },
  });
  const busy = save.isPending || remove.isPending;
  const patch = (value: Partial<Draft>) => {
    setDraft((old) => ({ ...old, ...value }));
    save.reset();
  };
  return (
    <Modal
      title={initial.id ? '폐기 기록 수정' : '폐기 기록'}
      close={close}
      dirty={dirty}
      busy={busy}
    >
      {!products.length ? (
        <Empty title="먼저 식재료를 등록해 주세요">
          <p>폐기 기록은 식재료 관리에 등록된 품목으로 남깁니다.</p>
          <Link className="btn" to="/products" onClick={close}>
            식재료 관리
          </Link>
        </Empty>
      ) : (
        <form
          className="waste-form"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <fieldset disabled={busy}>
            <div className="form-grid">
              <label className="field">
                폐기일
                <input
                  type="date"
                  value={draft.wasted_on}
                  max={today()}
                  onChange={(e) => patch({ wasted_on: e.target.value })}
                  required
                />
              </label>
              <label className="field">
                사유
                <select
                  value={draft.reason}
                  onChange={(e) => patch({ reason: e.target.value as WasteReason })}
                >
                  {Object.entries(wasteReasons).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              식재료
              <select
                value={draft.product_id}
                onChange={(e) => {
                  const next = products.find((p) => p.id === e.target.value);
                  patch({ product_id: e.target.value, unit: next?.unit ?? '' });
                }}
                required
              >
                <option value="">식재료를 선택해 주세요</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label className="field">
                수량
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={draft.quantity}
                  onChange={(e) => patch({ quantity: e.target.value })}
                  placeholder="예: 1.5"
                  required
                />
              </label>
              <label className="field">
                단위
                <select
                  value={draft.unit}
                  onChange={(e) => patch({ unit: e.target.value })}
                  disabled={!units.length}
                  required
                >
                  {!units.length && <option value="">식재료 선택 후</option>}
                  {units.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              메모 (선택)
              <textarea
                rows={2}
                maxLength={200}
                value={draft.note}
                onChange={(e) => patch({ note: e.target.value })}
                placeholder="예: 냉장고 온도 이상으로 변질"
              />
            </label>
          </fieldset>
          {loss !== undefined && (
            <div className={`waste-preview ${loss ? '' : 'unpriced'}`}>
              {loss ? (
                <>
                  <span>추정 손실</span>
                  <strong>{won(loss.amount)}</strong>
                  <small>
                    {shortDate(loss.purchased_at)} 확정 단가 {won(loss.unit_price)}/
                    {loss.price_unit} 기준
                  </small>
                </>
              ) : (
                <span>
                  폐기일 이전 확정 구매가격이 없어 손실 금액은 계산하지 않습니다. 기록은 저장됩니다.
                </span>
              )}
            </div>
          )}
          {(save.error || remove.error) && <ErrorState error={save.error || remove.error} />}
          <div className="modal-actions">
            {initial.id && (
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  if (window.confirm('이 폐기 기록을 삭제할까요?')) remove.mutate();
                }}
              >
                <Trash2 size={15} />
                삭제
              </button>
            )}
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (!dirty || window.confirm('입력한 내용을 저장하지 않고 닫을까요?')) close();
              }}
            >
              취소
            </button>
            <button className="btn primary" disabled={busy || !navigator.onLine}>
              {save.isPending ? '저장 중…' : '저장'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
