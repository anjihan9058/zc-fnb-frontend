import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Info, TrendingUp } from 'lucide-react';
import { useMenuCosts, usePrices } from '../app/hooks';
import { ErrorState, Loading } from '../shared/ui';
import { won } from '../shared/format';

function offset(date: string, days: number) {
  const d = new Date(`${date}T12:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const periods = [
  ['day', '당일'],
  ['week', '이번 주'],
  ['month', '이번 달'],
] as const;
const shortDate = (date: string) => `${Number(date.slice(5, 7))}.${Number(date.slice(8, 10))}`;
const percent = (value: number | null) => (value == null ? '—' : `${value.toFixed(1)}%`);

export function CostAccountingOverview({ date }: { date: string }) {
  const prices = usePrices(),
    menus = useMenuCosts(),
    [period, setPeriod] = useState<'day' | 'week' | 'month'>('month');
  const weekday = new Date(`${date}T12:00:00+09:00`).getUTCDay();
  const from =
    period === 'day'
      ? date
      : period === 'week'
        ? offset(date, -((weekday + 6) % 7))
        : `${date.slice(0, 7)}-01`;
  const purchases = prices.data?.filter((p) => p.purchased_at >= from && p.purchased_at <= date);
  const ready =
    menus.data?.filter(
      (m) => m.ingredient_cost != null && m.menu.selling_price != null && m.menu.selling_price > 0,
    ) ?? [];
  const selling = ready.reduce((n, m) => n + m.menu.selling_price!, 0),
    cost = ready.reduce((n, m) => n + m.ingredient_cost!, 0);
  const costRate = selling ? (cost / selling) * 100 : null;
  const raised =
    menus.data?.filter((m) => m.price_change_amount != null && m.price_change_amount > 0) ?? [];
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = offset(date, i - 6);
    return {
      day,
      amount: (prices.data ?? [])
        .filter((p) => p.purchased_at === day)
        .reduce((n, p) => n + p.quantity * p.unit_price, 0),
    };
  });
  const max = Math.max(1, ...week.map((d) => d.amount));
  const rows = [...(menus.data ?? [])]
    .sort((a, b) => (b.price_change_amount ?? -Infinity) - (a.price_change_amount ?? -Infinity))
    .slice(0, 5);
  const excluded = menus.data ? menus.data.length - ready.length : 0;
  return (
    <section className="panel cost-accounting-overview" aria-label="원가·구매 핵심 현황">
      <div className="panel-heading">
        <h2>원가 · 구매 핵심 현황</h2>
        <Link className="text-link" to="/reports?view=cost">
          원가 보고서
          <ArrowRight size={14} />
        </Link>
      </div>
      <div className="cost-summary">
        <section className="cost-group" aria-label="확정 구매 기록">
          <header>
            <h3>확정 구매 기록</h3>
            <div className="segmented-control" aria-label="구매 집계 기간">
              {periods.map(([key, label]) => (
                <button
                  key={key}
                  aria-pressed={period === key}
                  className={period === key ? 'active' : ''}
                  onClick={() => setPeriod(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </header>
          <div className="cost-group-body">
            <div className="cost-figure cost-figure-primary">
              <span>기간 내 확정 구매</span>
              <strong>
                {purchases
                  ? won(purchases.reduce((n, p) => n + p.quantity * p.unit_price, 0))
                  : '—'}
              </strong>
              <small>
                {from === date ? shortDate(date) : `${shortDate(from)} – ${shortDate(date)}`} · 구매
                거래일 기준
              </small>
            </div>
            <div className="cost-week">
              <div className="cost-week-head">
                <span>최근 7일</span>
                <strong>{prices.data ? won(week.reduce((n, d) => n + d.amount, 0)) : '—'}</strong>
              </div>
              {prices.data && (
                <ol
                  className="cost-week-bars"
                  aria-label={week.map((d) => `${d.day} ${won(d.amount)}`).join(', ')}
                >
                  {week.map((d, i) => (
                    <li key={d.day} title={`${d.day} · ${won(d.amount)}`}>
                      <i
                        className={i === 6 ? 'current' : ''}
                        style={{ height: `${d.amount ? Math.max(6, (d.amount / max) * 100) : 0}%` }}
                      />
                      <span>{Number(d.day.slice(8))}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </section>
        <section className="cost-group" aria-label="레시피 기준 예상값">
          <header>
            <h3>레시피 기준 예상값</h3>
          </header>
          <div className="cost-group-body cost-rates">
            <div className="cost-figure">
              <span>예상 원가율</span>
              <strong>{percent(costRate)}</strong>
              <small>계산 가능한 메뉴 {ready.length}개</small>
            </div>
            <div className="cost-figure">
              <span>예상 식재료 마진율</span>
              <strong>{costRate == null ? '—' : `${(100 - costRate).toFixed(1)}%`}</strong>
              <small>인건비·임대료 등 제외</small>
            </div>
          </div>
        </section>
      </div>
      <p className="cost-home-basis">
        <Info size={14} />
        <span>
          원가율·마진율은 각 메뉴 1인분 레시피의 예상값입니다. 판매량을 반영한 매장 원가율이나 회계
          손익이 아닙니다.
          {excluded > 0 && ` 설정이 부족한 ${excluded}개 메뉴는 제외했습니다.`}
        </span>
      </p>
      {(prices.error || menus.error) && (
        <ErrorState
          error={prices.error || menus.error}
          retry={() => {
            prices.refetch();
            menus.refetch();
          }}
        />
      )}
      {menus.isPending ? (
        <Loading />
      ) : rows.length ? (
        <div className="cost-home-table-wrap">
          <div className="cost-table-caption">
            <h3>원가 상승 순 주요 메뉴</h3>
            <span>직전 구매단가 기준 비교</span>
          </div>
          <table className="cost-home-table">
            <thead>
              <tr>
                <th>메뉴</th>
                <th className="numeric">판매가격</th>
                <th className="numeric">식재료 원가</th>
                <th className="numeric">원가율</th>
                <th className="numeric">예상 마진율</th>
                <th className="numeric">직전 단가 대비</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.menu.id}>
                  <td>
                    <Link to={`/menus?menu=${encodeURIComponent(m.menu.id)}`}>{m.menu.name}</Link>
                  </td>
                  <td className="numeric" data-label="판매">
                    {won(m.menu.selling_price)}
                  </td>
                  <td className="numeric" data-label="원가">
                    {m.ingredient_cost == null ? '계산 대기' : won(Math.round(m.ingredient_cost))}
                  </td>
                  <td className="numeric cost-rate-cell" data-label="원가율">
                    {percent(m.cost_rate)}
                  </td>
                  <td className="numeric" data-label="마진율">
                    {percent(m.margin_rate)}
                  </td>
                  <td
                    data-label="직전 대비"
                    className={`numeric ${m.price_change_amount != null && m.price_change_amount > 0 ? 'cost-increase' : ''}`}
                  >
                    {m.price_change_amount == null
                      ? '비교 대기'
                      : `${m.price_change_amount > 0 ? '+' : ''}${won(Math.round(m.price_change_amount))}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="cost-home-empty">
          <span>메뉴와 레시피를 등록하면 메뉴별 원가율과 예상 마진율이 표시됩니다.</span>
          <Link className="btn small" to="/menus">
            메뉴 등록
          </Link>
        </div>
      )}
      <footer>
        <span>
          <TrendingUp size={15} />
          원가 상승 메뉴 <b>{menus.data ? raised.length : '—'}</b>개
        </span>
        <Link className="text-link" to="/accounting">
          매입 · 회계 현황
          <ArrowRight size={14} />
        </Link>
      </footer>
    </section>
  );
}
