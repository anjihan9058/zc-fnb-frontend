import { createId } from '../shared/id';
import { confirmDiscard } from '../shared/navigation';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Carrot, Pencil, Plus, Search, Tags } from 'lucide-react';
import { api } from '../shared/api';
import { useProducts, useRefresh } from '../app/hooks';
import { Empty, ErrorState, Loading, Modal, useToast } from '../shared/ui';
import type { Product } from '../shared/types';
export function ProductsPage() {
  const query = useProducts();
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState<Product | null>(null);
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>식재료 관리</h1>
          <p>서로 다른 영수증 속 이름을 우리 가게의 식재료로 연결하세요.</p>
        </div>
        <button
          className="btn primary"
          onClick={() =>
            setEdit({
              id: createId(),
              name: '',
              unit: 'kg',
              category: '채소',
              aliases: [],
            })
          }
        >
          <Plus size={17} />
          식재료 등록
        </button>
      </div>
      <div className="info-box">
        <Tags size={18} />
        <span>
          예를 들어 ‘돈전지’와 ‘돼지고기 앞다리’를 하나의 품목으로 관리할 수 있어요. 포장 규격이
          다르면 별도 품목으로 등록하세요.
        </span>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>
            표준 식재료 <span className="number-label">{query.data?.length ?? 0}</span>
          </h2>
          <label className="search-field">
            <Search size={17} />
            <input
              aria-label="품목 또는 별칭 검색"
              placeholder="품목 또는 별칭 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} retry={() => query.refetch()} />
        ) : (
          <div className="product-cards">
            {query.data
              .filter((p) => `${p.name} ${p.aliases.join(' ')}`.includes(search))
              .map((p) => (
                <article key={p.id} className="product-card">
                  <div>
                    <span className="mini-icon green">
                      <Carrot size={21} />
                    </span>
                    <button
                      className="icon-btn"
                      aria-label={`${p.name} 수정`}
                      onClick={() => setEdit(p)}
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                  <h3>{p.name}</h3>
                  <p>
                    {p.category} <span>·</span> 기준 단위 {p.unit}
                  </p>
                  <div className="alias-tags">
                    {p.aliases.length ? (
                      p.aliases.map((a) => <span key={a}>{a}</span>)
                    ) : (
                      <span>등록된 별칭 없음</span>
                    )}
                  </div>
                </article>
              ))}
            {!query.data.some((p) => `${p.name} ${p.aliases.join(' ')}`.includes(search)) && (
              <Empty title="검색 결과가 없습니다" />
            )}
          </div>
        )}
      </section>
      {edit && (
        <ProductEditor
          key={edit.id}
          product={edit}
          existing={!!query.data?.some((p) => p.id === edit.id)}
          close={() => setEdit(null)}
        />
      )}
    </div>
  );
}
function ProductEditor({
  product,
  existing,
  close,
}: {
  product: Product;
  existing: boolean;
  close: () => void;
}) {
  const [name, setName] = useState(product.name);
  const [unit, setUnit] = useState(product.unit);
  const [category, setCategory] = useState(product.category);
  const [aliases, setAliases] = useState(product.aliases.join(', '));
  const dirty = name !== product.name || unit !== product.unit || category !== product.category || aliases !== product.aliases.join(', ');
  const refresh = useRefresh();
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: () =>
      api.saveProduct({
        ...product,
        name: name.trim(),
        unit: unit.trim(),
        category,
        aliases: [
          ...new Set(
            aliases
              .split(',')
              .map((a) => a.trim())
              .filter(Boolean),
          ),
        ],
      }),
    onSuccess: async () => {
      await refresh();
      toast('식재료 정보를 저장했습니다.');
      close();
    },
  });
  return (
    <Modal
      title={existing ? '식재료 정보 수정' : '새 식재료 등록'}
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
            품목명
            <input
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 양파 10kg망"
            />
          </label>
          <div className="form-grid">
            <label className="field">
              기준 단위
              <input
                required
                maxLength={20}
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                readOnly={existing}
              />
            </label>
            <label className="field">
              분류
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {['채소', '정육', '곡물', '수산물', '가공식품', '기타'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          {existing && (
            <p className="text-small muted">
              가격 비교의 일관성을 위해 기존 품목의 단위는 변경하지 않습니다. 다른 규격은 새
              품목으로 등록하세요.
            </p>
          )}
          <label className="field">
            영수증에 쓰이는 다른 이름
            <input
              value={aliases}
              maxLength={400}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="쉼표로 구분: 국산 양파, 양파 1kg"
            />
          </label>
          {mutation.error && <ErrorState error={mutation.error} />}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => { if (confirmDiscard(dirty, mutation.isPending)) close(); }}>
              취소
            </button>
            <button className="btn primary">
              {mutation.isPending ? '저장 중…' : '식재료 저장'}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
