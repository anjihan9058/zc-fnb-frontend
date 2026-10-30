import { MenuCostTable } from '../features/MenuCostTable';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { recipeUnits } from '../shared/units';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, ChefHat, Pencil, Plus, Save, Trash2, TrendingUp } from 'lucide-react';
import { useMenuCosts, useProducts, useRefresh } from '../app/hooks';
import { operationsApi, isDemo } from '../shared/api';
import type { MenuCost, MenuRecipe } from '../shared/operations';
import type { Product } from '../shared/types';
import { createId } from '../shared/id';
import { won } from '../shared/format';
import { Empty, ErrorState, Loading, Modal, useToast } from '../shared/ui';

const amount = (value: number | null) => (value == null ? '미설정' : won(Math.round(value)));
const rate = (value: number | null) => (value == null ? '계산 대기' : `${value.toFixed(1)}%`);
export function MenuCostPanel({ compact = false }: { compact?: boolean }) {
  const query = useMenuCosts();
  const ready = query.data?.filter((item) => item.cost_rate != null) ?? [];
  const raised = [...ready]
    .filter((item) => item.price_change_amount != null && item.price_change_amount > 0)
    .sort((a, b) => b.price_change_amount! - a.price_change_amount!);
  return (
    <section className="panel menu-cost-panel">
      <div className="panel-heading">
        <div>
          <h2>메뉴별 원가율 · 예상 마진율</h2>
          <p>판매가격과 레시피를 설정한 메뉴만 계산합니다.</p>
        </div>
        <Link to="/menus" className="text-link">
          메뉴 관리
          <ArrowRight size={16} />
        </Link>
      </div>
      {query.isPending && <Loading />}
      {query.error && <ErrorState error={query.error} retry={() => query.refetch()} />}
      {query.data?.length === 0 && (
        <Empty title="메뉴와 레시피를 등록해 주세요">
          <p>식재료별 사용량과 판매가격을 등록하면 원가와 예상 마진율을 볼 수 있어요.</p>
          <Link className="btn primary" to="/menus">
            메뉴 등록하기
          </Link>
        </Empty>
      )}
      {query.data && query.data.length > 0 && (
        <div className="menu-cost-overview">
          {(compact ? query.data.slice(0, 4) : query.data).map((item) => (
            <Link
              to={`/menus?menu=${encodeURIComponent(item.menu.id)}`}
              key={item.menu.id}
              className="menu-cost-overview-row"
            >
              <div>
                <strong>{item.menu.name}</strong>
                <small>
                  식재료 원가 {amount(item.ingredient_cost)} · 판매{' '}
                  {amount(item.menu.selling_price)}
                </small>
              </div>
              <div>
                <span>
                  원가율 <b>{rate(item.cost_rate)}</b>
                </span>
                <span>
                  예상 마진율 <b>{rate(item.margin_rate)}</b>
                </span>
                <div className="cost-progress" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, Math.max(0, item.cost_rate ?? 0))}%` }} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      {raised.length > 0 && (
        <div className="menu-price-alert">
          <TrendingUp size={17} />
          <span>
            원가 상승이 큰 메뉴: <strong>{raised[0].menu.name}</strong> · 직전 기준 대비{' '}
            {amount(raised[0].price_change_amount)} 상승
          </span>
        </div>
      )}
      <p className="menu-calculation-note">
        식재료만 반영한 예상값입니다. 인건비·임대료·수수료·포장비 등은 포함하지 않습니다.{' '}
        {isDemo
          ? '현재는 확정 구매 이력을 이용한 데모 계산입니다.'
          : '연결된 서버의 계산 결과입니다.'}
      </p>
    </section>
  );
}

export function MenusPage() {
  const query = useMenuCosts();
  const products = useProducts();
  const [editing, setEditing] = useState<MenuRecipe | null>(null);
  const [params, setParams] = useSearchParams();
  const detail = params.get('menu');
  const setDetail = (id: string | null) =>
    setParams(
      (old) => {
        const next = new URLSearchParams(old);
        if (id) next.set('menu', id);
        else next.delete('menu');
        return next;
      },
      { replace: true },
    );
  const [search, setSearch] = useState('');
  const filter = params.get('status') ?? 'ALL';
  const setFilter = (value: string) =>
    setParams(
      (old) => {
        const next = new URLSearchParams(old);
        next.set('status', value);
        return next;
      },
      { replace: true },
    );
  const refresh = useRefresh();
  const toast = useToast();
  const remove = useMutation({
    mutationFn: (menu: MenuRecipe) => operationsApi.deleteMenu(menu.id, menu.version),
    onSuccess: async () => {
      await refresh();
      setDetail(null);
      toast('메뉴를 삭제했습니다.');
    },
  });
  const sample = useMutation({
    mutationFn: () =>
      operationsApi.saveMenu({
        id: createId(),
        name: '양파 볶음 (가상 메뉴)',
        selling_price: 6500,
        version: 0,
        ingredients: [
          { id: createId(), product_id: 'onion', quantity: 0.2, unit: 'kg' },
          { id: createId(), product_id: 'oil', quantity: 0.015, unit: 'L' },
        ],
      }),
    onSuccess: async () => {
      await refresh();
      toast('가상 메뉴를 추가했습니다.');
    },
  });
  const selected = query.data?.find((item) => item.menu.id === detail);
  const listed =
    query.data?.filter(
      (item) =>
        item.menu.name.includes(search) &&
        (filter === 'ALL' ||
          (filter === 'READY' ? item.cost_rate != null : item.cost_rate == null)),
    ) ?? [];
  return (
    <div className="page menus-page">
      <div className="page-heading">
        <div>
          <h1>메뉴 · 원가</h1>
          <p>식재료 가격의 변화가 우리 메뉴의 원가에 얼마나 영향을 주는지 확인하세요.</p>
        </div>
        <button
          className="btn primary"
          onClick={() =>
            setEditing({
              id: createId(),
              name: '',
              selling_price: null,
              ingredients: [],
              version: 0,
            })
          }
        >
          <Plus size={17} />
          메뉴 등록
        </button>
      </div>
      <div className="analysis-menu-entry">
        <Link className="btn" to="/reports?view=cost">
          전월 비교 · AI 원가 분석
          <ArrowRight size={16} />
        </Link>
        <span>기존 원가 분석에서 재료별 기여도와 판매가격 시뮬레이션을 확인하세요.</span>
      </div>
      <div className="info-box">
        <ChefHat size={19} />
        <span>
          레시피 사용량은 <strong>g·kg, mL·L</strong>로 입력할 수 있습니다. 박스·봉지·개 등 포장
          단위는 등록된 규격과 같아야 합니다.
        </span>
      </div>
      <div className="operations-stats">
        <div>
          <span>등록 메뉴</span>
          <strong>{query.data?.length ?? 0}개</strong>
        </div>
        <div>
          <span>원가 계산 가능</span>
          <strong>{query.data?.filter((m) => m.cost_rate != null).length ?? 0}개</strong>
        </div>
        <div>
          <span>설정·가격 확인 필요</span>
          <strong>{query.data?.filter((m) => m.cost_rate == null).length ?? 0}개</strong>
        </div>
      </div>
      <div className="operations-filter">
        <label className="field">
          메뉴 검색
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="메뉴 이름"
          />
        </label>
        <label className="field">
          계산 상태
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="ALL">전체</option>
            <option value="READY">계산 가능</option>
            <option value="INCOMPLETE">확인 필요</option>
          </select>
        </label>
        {isDemo &&
          products.data?.some((p) => p.id === 'onion') &&
          products.data?.some((p) => p.id === 'oil') && (
            <button
              className="btn small"
              disabled={sample.isPending || !navigator.onLine}
              onClick={() => sample.mutate()}
            >
              가상 메뉴 추가
            </button>
          )}
      </div>
      {(query.error || products.error || remove.error || sample.error) && (
        <ErrorState
          error={query.error || products.error || remove.error || sample.error}
          retry={() => {
            query.refetch();
            products.refetch();
          }}
        />
      )}
      {(query.isPending || products.isPending) && <Loading />}
      {query.data && products.data && listed.length > 0 && (
        <MenuCostTable items={listed} open={setDetail} edit={setEditing} />
      )}
      {query.data && products.data && (
        <div className="menu-cards">
          {listed.map((item) => (
            <article className="panel menu-card" key={item.menu.id}>
              <div className="menu-card-header">
                <span className="mini-icon green">
                  <ChefHat size={20} />
                </span>
                <div>
                  <h2>{item.menu.name}</h2>
                  <small>
                    {item.menu.ingredients.length}개 식재료 · 판매 {amount(item.menu.selling_price)}
                  </small>
                </div>
                <button
                  className="icon-btn"
                  aria-label={`${item.menu.name} 수정`}
                  onClick={() => setEditing(structuredClone(item.menu))}
                >
                  <Pencil size={17} />
                </button>
              </div>
              <div className="menu-card-price">
                <span>식재료 원가</span>
                <strong>{amount(item.ingredient_cost)}</strong>
              </div>
              <div className="menu-card-rates">
                <div>
                  <span>원가율</span>
                  <strong>{rate(item.cost_rate)}</strong>
                </div>
                <div>
                  <span>예상 마진율</span>
                  <strong className={item.margin_rate != null && item.margin_rate < 0 ? 'up' : ''}>
                    {rate(item.margin_rate)}
                  </strong>
                </div>
              </div>
              {item.issues.length > 0 && <p className="review-hint">{item.issues.join(' · ')}</p>}
              {item.price_change_amount != null && (
                <p className="menu-price-change">
                  직전 구매단가 기준 대비 원가 {item.price_change_amount > 0 ? '+' : ''}
                  {amount(item.price_change_amount)}
                </p>
              )}
              <button className="btn full" onClick={() => setDetail(item.menu.id)}>
                레시피·계산 내역
                <ArrowRight size={16} />
              </button>
            </article>
          ))}
          {!listed.length && (
            <div className="panel">
              <Empty
                title={
                  query.data.length ? '조건에 맞는 메뉴가 없습니다' : '아직 등록한 메뉴가 없습니다'
                }
              >
                <p>메뉴와 식재료 사용량을 등록해 주세요.</p>
              </Empty>
            </div>
          )}
        </div>
      )}
      <p className="menu-calculation-note">
        예상 식재료 마진율 = (판매가격 − 식재료 원가) ÷ 판매가격 × 100. 인건비·임대료·수수료·포장비
        등은 제외합니다. 직전 원가는 현재 레시피 사용량에 각 재료의 직전 구매단가를 적용한
        비교값입니다.
      </p>
      {editing && products.data && (
        <RecipeEditor menu={editing} products={products.data} close={() => setEditing(null)} />
      )}
      {selected && (
        <Modal
          title={selected.menu.name}
          busy={remove.isPending}
          close={() => setDetail(null)}
          wide
        >
          <MenuCalculation item={selected} />
          <div className="upload-actions">
            <button
              className="btn"
              onClick={() => {
                setDetail(null);
                setEditing(structuredClone(selected.menu));
              }}
            >
              <Pencil size={16} />
              레시피 수정
            </button>
            <button
              className="btn danger"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(`${selected.menu.name} 메뉴와 레시피를 삭제할까요?`))
                  remove.mutate(selected.menu);
              }}
            >
              <Trash2 size={16} />
              메뉴 삭제
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function MenuCalculation({ item }: { item: MenuCost }) {
  return (
    <>
      <div className="operations-stats">
        <div>
          <span>식재료 원가</span>
          <strong>{amount(item.ingredient_cost)}</strong>
        </div>
        <div>
          <span>원가율</span>
          <strong>{rate(item.cost_rate)}</strong>
        </div>
        <div>
          <span>예상 마진율</span>
          <strong>{rate(item.margin_rate)}</strong>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>식재료</th>
              <th className="numeric">사용량</th>
              <th className="numeric">확정 구매단가</th>
              <th className="numeric">원가</th>
              <th>가격 기준 · 근거</th>
            </tr>
          </thead>
          <tbody>
            {item.ingredients.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td className="numeric">
                  {row.quantity ?? '미설정'} {row.unit}
                </td>
                <td className="numeric">
                  {amount(row.unit_price)} / {row.unit}
                </td>
                <td className="numeric">{amount(row.line_cost)}</td>
                <td>
                  {row.purchased_at ?? '구매 이력 없음'}
                  <br />
                  <small className="muted">{row.supplier}</small>
                  {row.purchase_unit && row.purchase_unit !== row.unit && (
                    <small className="cost-conversion">
                      {row.quantity} {row.unit} = {row.quantity_in_purchase_unit}{' '}
                      {row.purchase_unit}
                      <br />
                      구매 {amount(row.purchase_unit_price ?? null)} / {row.purchase_unit}
                    </small>
                  )}
                  {row.receipt_id && (
                    <Link
                      className="text-link cost-source-link"
                      to={`/receipts/${encodeURIComponent(row.receipt_id)}`}
                    >
                      근거 영수증
                      <ArrowRight size={12} />
                    </Link>
                  )}
                  {item.ingredient_cost != null &&
                    item.ingredient_cost > 0 &&
                    row.line_cost != null && (
                      <small className="cost-conversion">
                        전체 식재료 원가의{' '}
                        {((row.line_cost / item.ingredient_cost) * 100).toFixed(1)}%
                      </small>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {item.issues.length > 0 && <div className="info-box">{item.issues.join(' · ')}</div>}
      <p className="menu-calculation-note">
        판매가격 {amount(item.menu.selling_price)} · 예상 식재료 마진액 {amount(item.margin_amount)}
        . 모든 재료의 확정 단가와 판매가격이 있어야 비율을 계산합니다. 인건비 등 기타 비용은
        제외합니다.
      </p>
    </>
  );
}
function RecipeEditor({
  menu,
  products,
  close,
}: {
  menu: MenuRecipe;
  products: Product[];
  close: () => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(menu));
  const refresh = useRefresh();
  const toast = useToast();
  const dirty = JSON.stringify(draft) !== JSON.stringify(menu);
  const save = useMutation({
    mutationFn: () => operationsApi.saveMenu(draft),
    onSuccess: async () => {
      await refresh();
      toast('메뉴와 레시피를 저장했습니다.');
      close();
    },
  });
  return (
    <Modal
      title={menu.version ? '메뉴·레시피 수정' : '메뉴 등록'}
      dirty={dirty}
      busy={save.isPending}
      close={close}
      wide
    >
      <form
        data-unsaved={dirty}
        onSubmit={(e) => {
          e.preventDefault();
          if (!save.isPending) save.mutate();
        }}
      >
        <fieldset disabled={save.isPending}>
          <div className="form-grid">
            <label className="field">
              메뉴 이름
              <input
                required
                maxLength={60}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="예: 제육볶음"
              />
            </label>
            <label className="field">
              판매가격 (원)
              <input
                type="number"
                min="1"
                step="1"
                value={draft.selling_price ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    selling_price: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                placeholder="나중에 설정 가능"
              />
            </label>
          </div>
          <h3 className="recipe-heading">1인분에 사용하는 식재료</h3>
          <p className="muted text-small">
            g·kg, mL·L는 구매 단위로 환산합니다. 포장 단위는 추측하지 않으며 레시피·단가가 없으면
            계산 대기로 표시합니다.
          </p>
          <div className="recipe-editor-rows">
            {draft.ingredients.map((row, index) => (
              <div className="recipe-editor-row" key={row.id}>
                <label className="field">
                  식재료 {index + 1}
                  <select
                    required
                    value={row.product_id}
                    onChange={(e) => {
                      const product = products.find((p) => p.id === e.target.value);
                      setDraft({
                        ...draft,
                        ingredients: draft.ingredients.map((old) =>
                          old.id === row.id
                            ? { ...old, product_id: e.target.value, unit: product?.unit ?? '' }
                            : old,
                        ),
                      });
                    }}
                  >
                    <option value="">선택하세요</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} · {product.unit}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  사용량
                  <input
                    required
                    type="number"
                    min="0.000001"
                    step="any"
                    value={row.quantity ?? ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        ingredients: draft.ingredients.map((old) =>
                          old.id === row.id
                            ? {
                                ...old,
                                quantity: e.target.value === '' ? null : Number(e.target.value),
                              }
                            : old,
                        ),
                      })
                    }
                  />
                </label>
                <label className="field recipe-unit-select">
                  <span>단위</span>
                  <select
                    aria-label={`${index + 1}번 사용 단위`}
                    value={row.unit}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        ingredients: draft.ingredients.map((old) =>
                          old.id === row.id ? { ...old, unit: e.target.value } : old,
                        ),
                      })
                    }
                  >
                    {!row.unit && <option value="">단위</option>}
                    {[
                      ...new Set([
                        row.unit,
                        ...recipeUnits(
                          products.find((p) => p.id === row.product_id)?.unit ?? row.unit,
                        ),
                      ]),
                    ]
                      .filter(Boolean)
                      .map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`${index + 1}번 식재료 삭제`}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      ingredients: draft.ingredients.filter((old) => old.id !== row.id),
                    })
                  }
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn full"
            disabled={!products.length}
            onClick={() =>
              setDraft({
                ...draft,
                ingredients: [
                  ...draft.ingredients,
                  { id: createId(), product_id: '', quantity: null, unit: '' },
                ],
              })
            }
          >
            <Plus size={16} />
            식재료 추가
          </button>
          {!products.length && (
            <p className="muted">
              먼저 <Link to="/products">식재료 관리</Link>에서 품목을 등록해 주세요.
            </p>
          )}
          {save.error && <ErrorState error={save.error} />}
          <div className="upload-actions">
            <button className="btn primary" disabled={!navigator.onLine || save.isPending}>
              <Save size={16} />
              {save.isPending ? '저장 중…' : '메뉴·레시피 저장'}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
