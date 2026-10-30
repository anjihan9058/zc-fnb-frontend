import { useState } from 'react';
import { ArrowRight, RotateCcw } from 'lucide-react';
import { useAnalysisPreview } from '../app/useAnalysisPreview';
import {
  compareMenu,
  growth,
  ingredientContributions,
  monthLabel,
  shiftMonth,
  simulatePrice,
} from '../shared/analytics';
import { demoCostInsight } from '../mocks/analytics';
import { won } from '../shared/format';
import { Empty } from '../shared/ui';
import { AiAnalysisCard, AnalysisFilters, PointDelta } from './AnalysisCommon';

const rate = (n: number | null) => (n == null ? '—' : `${n.toFixed(1)}%`);
const signedWon = (n: number | null) => (n == null ? '—' : `${n > 0 ? '+' : ''}${won(n)}`);
const steps = [-1000, -500, 500, 1000];

export function MenuCostAnalysis() {
  const model = useAnalysisPreview(),
    { dataset, month } = model;
  const current = dataset.costs.find((s) => s.month === month),
    previous = dataset.costs.find((s) => s.month === shiftMonth(month, -1));
  const [menuId, setMenuId] = useState('demo-pork-bowl');
  const selected = current?.menus.find((m) => m.id === menuId) ?? current?.menus[0];
  const id = selected?.id ?? '',
    comparison = compareMenu(current, previous, id),
    contributions = ingredientContributions(current, previous, id);
  const key = `${dataset.workspace_id}:${month}:${id}`;
  const [draft, setDraft] = useState({ key: '', value: '' });
  const priceText = draft.key === key ? draft.value : String(selected?.selling_price ?? '');
  const price = priceText.trim() && Number.isFinite(Number(priceText)) ? Number(priceText) : null;
  const simulated = simulatePrice(comparison.currentCost, price),
    original = simulatePrice(comparison.currentCost, selected?.selling_price ?? null);
  const menus = (current?.menus ?? []).map((m) => ({ m, c: compareMenu(current, previous, m.id) }));
  // One shared scale for every menu so rate bars compare across rows.
  const rateScale =
    Math.ceil(
      Math.max(40, ...menus.flatMap(({ c }) => [c.currentRate ?? 0, c.previousRate ?? 0])) / 10,
    ) * 10;
  const effectScale = Math.max(1, ...contributions.rows.map((r) => Math.abs(r.effect ?? 0)));
  const nudge = (delta: number) =>
    setDraft({ key, value: String(Math.max(0, (price ?? selected?.selling_price ?? 0) + delta)) });

  return (
    <div className="menu-cost-analysis">
      <AnalysisFilters model={model} />
      {current?.menus.length ? (
        <>
          <section className="analysis-block">
            <div className="analysis-section-heading">
              <div>
                <h3>메뉴별 원가율 · 전월 대비</h3>
                <p>
                  {monthLabel(shiftMonth(month, -1))} → {monthLabel(month)} · 월별 레시피와 판매가
                  기준. 메뉴를 누르면 아래 상세 분석이 바뀝니다.
                </p>
              </div>
              <span className="analysis-badge">가상 메뉴</span>
            </div>
            <div className="table-scroll analysis-table-wrap">
              <table className="analysis-table analysis-menu-table">
                <thead>
                  <tr>
                    <th>메뉴</th>
                    <th className="numeric">판매가</th>
                    <th className="numeric">1인분 원가</th>
                    <th>당월 원가율</th>
                    <th className="numeric">전월 대비</th>
                  </tr>
                </thead>
                <tbody>
                  {menus.map(({ m, c }) => (
                    <tr key={m.id} aria-selected={m.id === id}>
                      <td>
                        <button
                          className="grid-row-link"
                          aria-pressed={m.id === id}
                          onClick={() => setMenuId(m.id)}
                        >
                          {m.name}
                        </button>
                      </td>
                      <td className="numeric" data-label="판매가">
                        {won(m.selling_price)}
                      </td>
                      <td className="numeric" data-label="1인분 원가">
                        {c.currentCost == null ? '—' : won(c.currentCost)}
                        <small>
                          {c.change == null ? '비교 불가' : `전월 ${signedWon(c.change)}`}
                        </small>
                      </td>
                      <td data-label="당월 원가율">
                        <RateBar
                          current={c.currentRate}
                          previous={c.previousRate}
                          scale={rateScale}
                        />
                      </td>
                      <td className="numeric" data-label="전월 대비">
                        <PointDelta value={c.rateChange} digits={2} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="analysis-table-note">
              <i className="analysis-rate-key" /> 당월 원가율{' '}
              <i className="analysis-rate-key prev" /> 전월 원가율 · 막대 끝 0–{rateScale}%
            </p>
          </section>

          <section className="analysis-detail">
            <div className="analysis-detail-head">
              <div>
                <h3>{selected?.name} 상세</h3>
                <p>재료별 단가 변화가 1인분 원가에 준 영향과 판매가격 가정</p>
              </div>
              <label className="analysis-filter">
                <span>상세 분석 메뉴</span>
                <select
                  aria-label="상세 분석 메뉴"
                  value={id}
                  onChange={(e) => setMenuId(e.target.value)}
                >
                  {current.menus.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="analysis-menu-detail">
              <section className="panel analysis-contribution">
                <div className="analysis-panel-head">
                  <div>
                    <h4>식재료별 원가 변화 기여</h4>
                    <p>1인분 · 당월 사용량에 전월·당월 단가를 각각 적용한 차이</p>
                  </div>
                </div>
                {contributions.rows.length ? (
                  <ul className="analysis-contrib-list">
                    {contributions.rows.map((r) => {
                      const width = r.effect == null ? 0 : (Math.abs(r.effect) / effectScale) * 50;
                      const change = growth(r.currentPrice, r.previousPrice);
                      return (
                        <li key={r.id}>
                          <div className="analysis-contrib-head">
                            <span>
                              <strong>{r.name}</strong>
                              <small>
                                사용량 {r.quantity ?? '미입력'} {r.unit}
                              </small>
                            </span>
                            <b
                              data-direction={
                                r.effect == null
                                  ? 'none'
                                  : r.effect > 0
                                    ? 'up'
                                    : r.effect < 0
                                      ? 'down'
                                      : 'flat'
                              }
                            >
                              {r.effect == null ? '비교 불가' : signedWon(r.effect)}
                            </b>
                          </div>
                          <div className="analysis-diverge" aria-hidden="true">
                            {r.effect != null && r.effect !== 0 && (
                              <span
                                data-direction={r.effect > 0 ? 'up' : 'down'}
                                style={{
                                  width: `${width}%`,
                                  left: r.effect > 0 ? '50%' : `${50 - width}%`,
                                }}
                              />
                            )}
                          </div>
                          <p className="analysis-contrib-meta">
                            <span>
                              {won(r.previousPrice)} <ArrowRight size={11} />{' '}
                              {`${won(r.currentPrice)}/${r.unit}`}
                              {change != null && ` (${change > 0 ? '+' : ''}${change.toFixed(1)}%)`}
                            </span>
                            <span>
                              {r.share != null
                                ? `상승분의 ${r.share.toFixed(0)}%`
                                : r.effect != null && r.effect < 0
                                  ? '인하 · 상쇄'
                                  : ''}
                            </span>
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <Empty title="재료별 비교 단가가 없습니다" />
                )}
                <div className="analysis-contrib-total">
                  <span>
                    단가 효과 <b>{signedWon(contributions.priceEffect)}</b>
                  </span>
                  <span aria-hidden="true">+</span>
                  <span>
                    구성·미분류 <b>{signedWon(contributions.residual)}</b>
                  </span>
                  <span aria-hidden="true">=</span>
                  <span>
                    1인분 원가 변화 <b>{signedWon(comparison.change)}</b>
                  </span>
                </div>
                <p className="analysis-chart-note">
                  상승분 비중은 양의 단가 효과 합계 기준이며, 인하 효과와 구성 변화는 따로
                  표시합니다.
                </p>
              </section>

              <section className="panel analysis-simulator">
                <div className="analysis-panel-head">
                  <div>
                    <h4>판매가격 시뮬레이션</h4>
                    <p>당월 식재료 원가를 고정한 계산 · 실제 판매가는 바뀌지 않습니다</p>
                  </div>
                </div>
                <div className="analysis-simulator-body">
                  <label className="field">
                    가정 판매가격 (원)
                    <input
                      aria-label="가정 판매가격"
                      inputMode="numeric"
                      type="number"
                      min="1"
                      step="100"
                      value={priceText}
                      onChange={(e) => setDraft({ key, value: e.target.value })}
                    />
                  </label>
                  <div className="analysis-steps" role="group" aria-label="판매가격 빠르게 조정">
                    {steps.map((s) => (
                      <button key={s} type="button" onClick={() => nudge(s)}>
                        {s > 0 ? '+' : '−'}
                        {Math.abs(s).toLocaleString('ko-KR')}
                      </button>
                    ))}
                  </div>
                  {(price == null || price <= 0) && (
                    <p className="analysis-input-error" role="alert">
                      0보다 큰 판매가격을 입력해 주세요.
                    </p>
                  )}
                  <dl className="analysis-simulation-results" aria-live="polite">
                    <div className="analysis-simulation-columns" aria-hidden="true">
                      <dt />
                      <dd>
                        <span>현재</span>
                        <span>가정</span>
                      </dd>
                    </div>
                    <div className="analysis-simulation-key">
                      <dt>예상 원가율</dt>
                      <dd>
                        <span>{rate(original.cost_rate)}</span>
                        <strong>{rate(simulated.cost_rate)}</strong>
                      </dd>
                    </div>
                    <div>
                      <dt>예상 식재료 마진율</dt>
                      <dd>
                        <span>{rate(original.margin_rate)}</span>
                        <b>{rate(simulated.margin_rate)}</b>
                      </dd>
                    </div>
                    <div>
                      <dt>1개당 식재료 마진</dt>
                      <dd>
                        <span>{won(original.margin_amount).replace('미입력', '—')}</span>
                        <b>{won(simulated.margin_amount).replace('미입력', '—')}</b>
                      </dd>
                    </div>
                    <div>
                      <dt>판매가격</dt>
                      <dd>
                        <span>{won(selected?.selling_price)}</span>
                        <b>{price != null && price > 0 ? won(price) : '—'}</b>
                      </dd>
                    </div>
                    <div className="analysis-simulation-fixed">
                      <dt>고정 식재료 원가</dt>
                      <dd>{won(comparison.currentCost)}</dd>
                    </div>
                  </dl>
                  <button
                    className="btn small"
                    type="button"
                    onClick={() => setDraft({ key, value: String(selected?.selling_price ?? '') })}
                  >
                    <RotateCcw size={14} />
                    현재 판매가격으로 되돌리기
                  </button>
                  <p className="analysis-chart-note">
                    판매량·수요 변화·인건비·임대료·수수료는 반영하지 않습니다.
                  </p>
                </div>
              </section>
            </div>
          </section>

          <AiAnalysisCard insight={demoCostInsight(dataset, month, id)} />
        </>
      ) : (
        <Empty title="월별 원가 분석 자료가 없습니다">
          <p>비교할 월별 레시피·판매가격·식재료 단가 스냅샷이 필요합니다.</p>
        </Empty>
      )}
    </div>
  );
}

/** Bullet bar: the bar is this month's cost rate, the tick is last month's. */
function RateBar({
  current,
  previous,
  scale,
}: {
  current: number | null;
  previous: number | null;
  scale: number;
}) {
  const at = (n: number) => `${Math.min(100, (n / scale) * 100)}%`;
  return (
    <div className="analysis-ratebar">
      <span className="analysis-ratebar-track" aria-hidden="true">
        {current != null && <i className="analysis-ratebar-fill" style={{ width: at(current) }} />}
        {previous != null && <i className="analysis-ratebar-prev" style={{ left: at(previous) }} />}
      </span>
      <span className="analysis-ratebar-value">
        <b>{rate(current)}</b>
        <small>전월 {rate(previous)}</small>
      </span>
    </div>
  );
}
