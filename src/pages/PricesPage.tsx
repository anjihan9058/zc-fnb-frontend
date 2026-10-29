import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { ArrowRight, ChartNoAxesCombined, Search, ShieldCheck, TrendingUp } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { usePrices, useProducts } from '../app/hooks';
import { Empty, ErrorState, Loading } from '../shared/ui';
import { dateLabel, today, won } from '../shared/format';
import { dayAgo } from '../mocks/seed';
export function PricesPage() {
  const query = usePrices();
  const products = useProducts();
  const [params, setParams] = useSearchParams();
  const productId = params.get('product') ?? 'onion';
  const [supplier, setSupplier] = useState('ALL');
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState('30');
  if (query.isPending || products.isPending) return <Loading />;
  if (query.error || products.error)
    return (
      <ErrorState
        error={query.error || products.error}
        retry={() => {
          query.refetch();
          products.refetch();
        }}
      />
    );
  const p = products.data.find((p) => p.id === productId) ?? products.data[0];
  const all = query.data;
  const suppliers = Array.from(new Set(all.map((p) => p.supplier)));
  const full = all
    .filter(
      (i) =>
        i.product_id === p?.id &&
        i.unit === p?.unit &&
        (supplier === 'ALL' || supplier === i.supplier),
    )
    .sort((a, b) => a.purchased_at.localeCompare(b.purchased_at));
  const history = full
    .filter((i) => period === 'ALL' || i.purchased_at >= dayAgo(Number(period)))
    .filter((i) => i.purchased_at <= today());
  const last = history.at(-1);
  const index = last ? full.findIndex((i) => i.id === last.id) : -1;
  const previous = index > 0 ? full[index - 1] : undefined;
  const yesterday = full.filter((i) => i.purchased_at === dayAgo(1)).at(-1);
  const change = last && previous ? (last.unit_price / previous.unit_price - 1) * 100 : null;
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>식재료 가격</h1>
          <p>작은 단가 변화도 놓치지 않도록, 구매가격을 기록해요.</p>
        </div>
        <span className="verified-label">
          <ShieldCheck size={16} />
          확정된 구매 기록
        </span>
      </div>
      <div className="price-page-layout">
        <aside className="panel product-selector">
          <label className="search-field">
            <Search size={17} />
            <input
              aria-label="식재료 검색"
              placeholder="식재료 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="product-select-list">
            {products.data
              .filter((item) => `${item.name} ${item.aliases.join(' ')}`.includes(search))
              .map((item) => (
                <button
                  key={item.id}
                  className={item.id === p?.id ? 'active' : ''}
                  onClick={() => setParams({ product: item.id })}
                >
                  <span className="product-initial">{item.name.slice(0, 1)}</span>
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {item.category} · {item.unit}
                    </small>
                  </span>
                  <ArrowRight size={15} />
                </button>
              ))}
          </div>
        </aside>
        <div className="price-main">
          <section className="panel price-chart-panel">
            <div className="panel-heading">
              <div>
                <h2>{p?.name ?? '식재료'} 구매가격</h2>
                <p>동일 규격 · {p?.unit}당 단가</p>
              </div>
              <div className="chart-filters">
                <select
                  aria-label="거래처 필터"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                >
                  <option value="ALL">전체 거래처</option>
                  {suppliers.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <select
                  aria-label="조회 기간"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                >
                  <option value="7">최근 7일</option>
                  <option value="30">최근 30일</option>
                  <option value="ALL">전체 기간</option>
                </select>
              </div>
            </div>
            <div className="price-summary">
              <div>
                <span>최근 구매가격</span>
                <strong>{won(last?.unit_price)}</strong>
                <small>{last ? dateLabel(last.purchased_at) : '구매 데이터 없음'}</small>
              </div>
              <div>
                <span>직전 구매가격</span>
                <strong>{previous ? won(previous.unit_price) : '비교 기록 없음'}</strong>
                <small>
                  {previous
                    ? `${dateLabel(previous.purchased_at)} · ${previous.supplier}`
                    : '동일 품목·단위의 이전 구매 없음'}
                </small>
              </div>
              <div>
                <span>전날 구매가격</span>
                <strong>{yesterday ? won(yesterday.unit_price) : '전날 데이터 없음'}</strong>
                <small>{dateLabel(dayAgo(1))} 거래 기준</small>
              </div>
            </div>
            {last && change != null && (
              <div className={`price-change-line ${change > 0 ? 'up' : 'down'}`}>
                <TrendingUp size={15} />
                직전 구매 대비 {change > 0 ? '+' : ''}
                {change.toFixed(1)}%<span className="muted"> · {previous?.unit} 기준</span>
              </div>
            )}
            {history.length ? (
              <div className="price-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history} margin={{ top: 18, left: 0, right: 15, bottom: 0 }}>
                    <defs>
                      <linearGradient id="history-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--border)" />
                    <XAxis
                      dataKey="purchased_at"
                      tickFormatter={(d) => d.slice(5).replace('-', '.')}
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={35}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      formatter={(v) => won(Number(v))}
                      labelFormatter={(v) => dateLabel(String(v))}
                    />
                    <Area
                      dataKey="unit_price"
                      name="단가"
                      type="monotone"
                      stroke="var(--brand)"
                      strokeWidth={2.5}
                      fill="url(#history-fill)"
                      dot={{ r: 3, strokeWidth: 2, fill: 'white' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty title="이 조건의 구매 이력이 없어요">
                <p>필터를 변경하거나 영수증을 승인해 주세요.</p>
              </Empty>
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>
                  구매 이력 <span className="number-label">{history.length}</span>
                </h2>
                <p>미승인 인식값은 포함하지 않습니다.</p>
              </div>
              <ChartNoAxesCombined size={20} className="muted" />
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>거래일</th>
                    <th>거래처</th>
                    <th className="numeric">수량</th>
                    <th className="numeric">단가</th>
                    <th className="numeric">금액</th>
                  </tr>
                </thead>
                <tbody>
                  {[...history].reverse().map((i) => (
                    <tr key={i.id}>
                      <td>{dateLabel(i.purchased_at)}</td>
                      <td>{i.supplier}</td>
                      <td className="numeric">
                        {i.quantity} {i.unit}
                      </td>
                      <td className="numeric money">{won(i.unit_price)}</td>
                      <td className="numeric">{won(i.quantity * i.unit_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!history.length && (
              <Empty title="확정된 구매 기록이 없습니다">
                <Link to="/receipts" className="text-link">
                  영수증 확인하기
                  <ArrowRight size={15} />
                </Link>
              </Empty>
            )}
          </section>
          <p className="demo-footnote">
            서로 다른 규격·단위는 비교하지 않습니다. 같은 날 여러 구매는 등록 순서의 마지막 구매를
            기준으로 표시합니다. 부가세·할인 배분 기준은 백엔드 계약에서 확정해야 합니다.
          </p>
        </div>
      </div>
    </div>
  );
}
