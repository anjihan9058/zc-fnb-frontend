import { useState } from 'react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnalysisPreviewModel } from '../app/useAnalysisPreview';
import {
  financialMetrics,
  financialSeries,
  growth,
  monthLabel,
  ratio,
  shiftMonth,
} from '../shared/analytics';
import { demoFinancialInsight } from '../mocks/analytics';
import { won } from '../shared/format';
import { Empty } from '../shared/ui';
import { AiAnalysisCard, AnalysisFilters, DeltaChip, PointDelta } from './AnalysisCommon';
import { FinancialInputsEditor } from './FinancialInputsEditor';

type SeriesRow = ReturnType<typeof financialSeries>[number];
type Metrics = ReturnType<typeof financialMetrics>;

/* Colour follows the entity on every chart and tile of this page. */
const costs = [
  { key: 'food', name: '식재료비', color: 'var(--chart-1)' },
  { key: 'labor', name: '인건비', color: 'var(--chart-2)' },
  { key: 'other', name: '기타 운영비', color: 'var(--chart-3)' },
] as const;
const SALES = 'var(--chart-ink)';

const manwon = (n: number) =>
  n === 0 ? '0' : `${Math.round(n / 10000).toLocaleString('ko-KR')}만`;
const pct = (n: number | null) => (n == null ? '—' : `${n.toFixed(1)}%`);
const amount = (n: number | null) => (n == null ? '—' : won(n));
const monthTick = (month: string, first: boolean) =>
  first || month.endsWith('-01')
    ? `${month.slice(2, 4)}년 ${Number(month.slice(5))}월`
    : `${Number(month.slice(5))}월`;
/** Round 만원 steps so the axis reads 0 / 500만 / 1,000만 rather than odd values. */
function amountTicks(values: (number | null)[]) {
  const max = Math.max(1, ...values.filter((v): v is number => v != null));
  const step =
    [1e6, 2e6, 2.5e6, 5e6, 1e7, 2e7, 2.5e7, 5e7, 1e8].find((s) => Math.ceil(max / s) <= 5) ??
    Math.ceil(max / 5);
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}
/** A rounded scale bound so small growth rates still get readable bars. */
const niceBound = (n: number) =>
  [0.5, 1, 2, 3, 4, 5, 8, 10, 15, 20, 30, 50, 100].find((s) => n <= s) ?? Math.ceil(n);

export function FinancialAnalysis({ model }: { model: AnalysisPreviewModel }) {
  const [count, setCount] = useState(6),
    { dataset, month } = model;
  const row = dataset.financials.find((r) => r.month === month),
    previous = dataset.financials.find((r) => r.month === shiftMonth(month, -1));
  const now = financialMetrics(row),
    before = financialMetrics(previous);
  const useOperating = now.operatingProfit != null;
  const series = financialSeries(dataset, month, count);
  const ticks = amountTicks(series.flatMap((r) => [r.sales, r.totalCost]));
  const year = financialSeries(dataset, month, 12);
  const available = !!row;
  const profitLabel = useOperating ? '영업손익 (예시)' : '매출총이익';
  const profit = (m: Metrics) => (useOperating ? m.operatingProfit : m.grossProfit);
  const kpis = [
    {
      name: '총매출',
      value: now.sales,
      old: before.sales,
      goodWhen: 'up' as const,
      trend: year.map((r) => r.sales),
      detail: before.sales == null ? '전월 자료 없음' : `전월 ${won(before.sales)}`,
      note: '순매출 기준 · 할인·환불·부가세 제외',
    },
    {
      name: '식재료비',
      value: now.food,
      old: before.food,
      goodWhen: 'down' as const,
      trend: year.map((r) => r.food),
      detail: `매출 대비 ${pct(now.foodRate)}`,
      note: row?.entry_source === 'manual' ? '직접 입력한 월간 식재료비 · 테스트' : '레시피 소요 + 폐기 가정 · 예시',
    },
    {
      name: '인건비',
      value: now.labor,
      old: before.labor,
      goodWhen: 'down' as const,
      trend: year.map((r) => r.labor),
      detail: `매출 대비 ${pct(now.laborRate)}`,
      note: row?.entry_source === 'manual' ? '직접 입력한 월간 인건비 · 테스트' : '월별 인건비 예시',
    },
    {
      name: profitLabel,
      value: profit(now),
      old: profit(before),
      goodWhen: 'up' as const,
      trend: year.map((r) => (useOperating ? r.operatingProfit : r.grossProfit)),
      detail: `${useOperating ? '영업이익률' : '매출총이익률'} ${pct(ratio(profit(now), now.sales))}`,
      note: useOperating ? '금융비용·법인세 등 미포함' : '매출 − 식재료비 · 운영비 연결 전',
    },
  ];

  return (
    <div className="financial-analysis">
      <AnalysisFilters model={model}>
        <label className="analysis-filter">
          <span>추이 기간</span>
          <select
            aria-label="재무 차트 기간"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          >
            <option value={3}>최근 3개월</option>
            <option value={6}>최근 6개월</option>
            <option value={12}>최근 12개월</option>
          </select>
        </label>
      </AnalysisFilters>

      <FinancialInputsEditor model={model} />

      <div className="analysis-kpis">
        {kpis.map((k) => (
          <article key={k.name}>
            <header>
              <h2>{k.name}</h2>
              <DeltaChip current={k.value} previous={k.old} goodWhen={k.goodWhen} />
            </header>
            <strong className="analysis-kpi-value">
              {k.value == null ? (
                '—'
              ) : (
                <>
                  {k.value.toLocaleString('ko-KR')}
                  <small>원</small>
                </>
              )}
            </strong>
            <div className="analysis-kpi-foot">
              <p className="analysis-kpi-detail">{available ? k.detail : '자료 연결 후 표시'}</p>
              <Sparkline values={available ? k.trend : []} />
            </div>
            <p className="analysis-kpi-note">{k.note}</p>
          </article>
        ))}
      </div>

      <div className="analysis-board">
        <section className="panel analysis-trend">
          <div className="analysis-panel-head">
            <div>
              <h2>월별 매출 · 비용 추이</h2>
              <p>막대는 비용 항목을 쌓은 합계, 선은 순매출입니다. 둘의 차이가 남는 금액입니다.</p>
            </div>
            {available && <ChartLegend />}
          </div>
          {available ? (
            <>
              <div
                className="analysis-chart"
                role="img"
                aria-label="월별 비용 구성 막대와 순매출 선 그래프. 정확한 값은 아래 데이터 표에서 확인할 수 있습니다."
              >
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={series}
                    margin={{ top: 28, right: 12, bottom: 0, left: 0 }}
                    barCategoryGap="30%"
                  >
                    <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={{ stroke: 'var(--border-strong)' }}
                      interval={count <= 6 ? 0 : 'preserveStartEnd'}
                      minTickGap={6}
                      tick={(props) => (
                        <MonthTick {...props} selected={month} first={series[0]?.month} />
                      )}
                    />
                    <YAxis
                      ticks={ticks}
                      domain={[0, ticks.at(-1) ?? 'auto']}
                      tickFormatter={manwon}
                      tickLine={false}
                      axisLine={false}
                      width={52}
                      tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                    />
                    <Tooltip content={<TrendTooltip />} cursor={{ fill: 'var(--chart-cursor)' }} />
                    {costs.map((c, i) => (
                      <Bar
                        key={c.key}
                        dataKey={c.key}
                        name={c.name}
                        stackId="cost"
                        fill={c.color}
                        stroke="var(--surface)"
                        strokeWidth={1}
                        maxBarSize={28}
                        radius={i === costs.length - 1 ? [4, 4, 0, 0] : 0}
                        isAnimationActive={false}
                      >
                        {series.map((r) => (
                          <Cell key={r.month} fillOpacity={r.month === month ? 1 : 0.38} />
                        ))}
                      </Bar>
                    ))}
                    <Line
                      type="linear"
                      dataKey="sales"
                      name="순매출"
                      stroke={SALES}
                      strokeWidth={2}
                      connectNulls={false}
                      isAnimationActive={false}
                      dot={(props) => <SalesDot {...props} selected={month} />}
                      activeDot={{ r: 5, fill: SALES, stroke: 'var(--surface)', strokeWidth: 2 }}
                      label={(props) => <SalesLabel {...props} series={series} selected={month} />}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="analysis-chart-note">
                누락된 비용은 0원으로 보정하지 않으며, 합계를 계산할 수 없는 달은 막대와 선이 비어
                있습니다.
              </p>
              <TrendTable series={series} selected={month} />
            </>
          ) : (
            <Empty title="매출·비용 자료가 없습니다" />
          )}
        </section>

        <Composition now={now} before={before} month={month} />
        <Variance
          now={now}
          before={before}
          month={month}
          profitLabel={profitLabel}
          profit={profit}
        />

        {available ? (
          <AiAnalysisCard insight={demoFinancialInsight(dataset, month)} />
        ) : (
          <section className="panel analysis-ai-card">
            <div className="panel-heading">
              <h2>AI 종합 분석</h2>
            </div>
            <Empty title="분석 근거가 없어 결과를 표시하지 않습니다" />
          </section>
        )}
      </div>
    </div>
  );
}

function ChartLegend() {
  return (
    <ul className="analysis-legend" aria-label="범례">
      <li>
        <i className="analysis-key analysis-key-line" style={{ background: SALES }} />
        순매출
      </li>
      {costs.map((c) => (
        <li key={c.key}>
          <i className="analysis-key" style={{ background: c.color }} />
          {c.name}
        </li>
      ))}
    </ul>
  );
}

/** 12-month trend; the selected month is the accented end point. */
function Sparkline({ values }: { values: (number | null)[] }) {
  const known = values.filter((v): v is number => v != null);
  if (known.length < 2) return <span className="analysis-spark" aria-hidden="true" />;
  const w = 88,
    h = 30,
    pad = 4,
    min = Math.min(...known),
    max = Math.max(...known);
  const x = (i: number) => pad + (i * (w - pad * 2)) / (values.length - 1);
  const y = (v: number) =>
    max === min ? h / 2 : h - pad - ((v - min) / (max - min)) * (h - pad * 2);
  let d = '';
  values.forEach((v, i) => {
    if (v == null) return;
    d += `${i === 0 || values[i - 1] == null ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
  });
  const last = values.at(-1);
  return (
    <svg
      className="analysis-spark"
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      aria-hidden="true"
    >
      <path d={d} />
      {last != null && <circle cx={x(values.length - 1)} cy={y(last)} r={3.5} />}
    </svg>
  );
}

type TickProps = { x?: number | string; y?: number | string; payload?: { value: string } };
function MonthTick({
  x,
  y,
  payload,
  selected,
  first,
}: TickProps & { selected: string; first?: string }) {
  const value = payload?.value ?? '';
  const active = value === selected;
  return (
    <text
      x={Number(x)}
      y={Number(y) + 14}
      textAnchor="middle"
      fontSize={11}
      fontWeight={active ? 700 : 400}
      fill={active ? 'var(--text)' : 'var(--text-tertiary)'}
    >
      {monthTick(value, value === first)}
    </text>
  );
}

type DotProps = { cx?: number; cy?: number; payload?: SeriesRow; index?: number };
function SalesDot({ cx, cy, payload, selected }: DotProps & { selected: string }) {
  if (cx == null || cy == null || payload?.sales == null) return <g />;
  const active = payload.month === selected;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={active ? 4.5 : 3}
      fill={active ? SALES : 'var(--surface)'}
      stroke={active ? 'var(--surface)' : SALES}
      strokeWidth={active ? 2 : 1.5}
    />
  );
}

type LabelProps = { x?: number | string; y?: number | string; index?: number };
/** Only the selected month is labelled; the axis and tooltip carry the rest. */
function SalesLabel({
  x,
  y,
  index,
  series,
  selected,
}: LabelProps & { series: SeriesRow[]; selected: string }) {
  const point = index == null ? undefined : series[index];
  if (!point || point.month !== selected || point.sales == null) return <g />;
  return (
    <text x={Number(x)} y={Number(y) - 12} textAnchor="middle" className="analysis-chart-label">
      {manwon(point.sales)}
    </text>
  );
}

type TooltipProps = { active?: boolean; payload?: { payload: SeriesRow }[] };
function TrendTooltip({ active, payload }: TooltipProps) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  const operating = row.operatingProfit;
  return (
    <div className="analysis-tooltip">
      <p>{monthLabel(row.month)}</p>
      <dl>
        <div>
          <dt>
            <i className="analysis-key analysis-key-line" style={{ background: SALES }} />
            순매출
          </dt>
          <dd>{row.sales == null ? '자료 없음' : won(row.sales)}</dd>
        </div>
        {costs.map((c) => (
          <div key={c.key}>
            <dt>
              <i className="analysis-key" style={{ background: c.color }} />
              {c.name}
            </dt>
            <dd>{row[c.key] == null ? '자료 없음' : won(row[c.key])}</dd>
          </div>
        ))}
        <div className="analysis-tooltip-sum">
          <dt>비용 합계</dt>
          <dd>{row.totalCost == null ? '계산 불가' : won(row.totalCost)}</dd>
        </div>
        <div className="analysis-tooltip-sum">
          <dt>영업손익 (예시)</dt>
          <dd>
            {operating == null ? '계산 보류' : won(operating)}
            {operating != null && <small>{pct(ratio(operating, row.sales))}</small>}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function TrendTable({ series, selected }: { series: SeriesRow[]; selected: string }) {
  return (
    <details className="analysis-data-table">
      <summary>차트 데이터 표로 보기</summary>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>월</th>
              <th className="numeric">순매출</th>
              {costs.map((c) => (
                <th key={c.key} className="numeric">
                  {c.name}
                </th>
              ))}
              <th className="numeric">비용 합계</th>
              <th className="numeric">영업손익 (예시)</th>
            </tr>
          </thead>
          <tbody>
            {series.map((r) => (
              <tr key={r.month} aria-current={r.month === selected ? 'true' : undefined}>
                <td>{monthLabel(r.month)}</td>
                <td className="numeric">{r.sales == null ? '자료 없음' : won(r.sales)}</td>
                {costs.map((c) => (
                  <td key={c.key} className="numeric">
                    {r[c.key] == null ? '자료 없음' : won(r[c.key])}
                  </td>
                ))}
                <td className="numeric">{r.totalCost == null ? '계산 불가' : won(r.totalCost)}</td>
                <td className="numeric">
                  {r.operatingProfit == null ? '계산 보류' : won(r.operatingProfit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Where this month's sales went, with last month's split underneath for comparison. */
function Composition({ now, before, month }: { now: Metrics; before: Metrics; month: string }) {
  const known = now.sales != null && now.sales > 0 && now.totalCost != null;
  const share = (m: Metrics, key: (typeof costs)[number]['key']) => ratio(m[key], m.sales);
  const totalRate = ratio(now.totalCost, now.sales) ?? 0;
  const previousKnown = before.sales != null && before.sales > 0 && before.totalCost != null;
  const base = Math.max(100, totalRate, previousKnown ? ratio(before.totalCost, before.sales)! : 0);
  const rows = costs.map((c) => ({
    ...c,
    value: now[c.key],
    rate: share(now, c.key),
    change:
      share(now, c.key) != null && share(before, c.key) != null
        ? share(now, c.key)! - share(before, c.key)!
        : null,
  }));
  const prime = ratio(
    now.food != null && now.labor != null ? now.food + now.labor : null,
    now.sales,
  );
  const bar = (m: Metrics, label: string, current: boolean) => (
    <div className="analysis-stackrow" data-current={current}>
      <span className="analysis-stackrow-label">{label}</span>
      <div className="analysis-stackbar">
        {costs.map((c) => (
          <span
            key={c.key}
            style={{ width: `${((share(m, c.key) ?? 0) / base) * 100}%`, background: c.color }}
          />
        ))}
        {base > 100 && (
          <i className="analysis-stackbar-limit" style={{ left: `${(100 / base) * 100}%` }} />
        )}
      </div>
    </div>
  );
  return (
    <section className="panel analysis-composition">
      <div className="analysis-panel-head">
        <div>
          <h2>매출 대비 비용 구성</h2>
          <p>{monthLabel(month)} · 순매출을 100%로 보았을 때</p>
        </div>
      </div>
      {known ? (
        <div className="analysis-composition-body">
          <div
            className="analysis-stackrows"
            role="img"
            aria-label={`매출 대비 비용 합계 ${totalRate.toFixed(1)}%`}
          >
            {bar(now, `${Number(month.slice(5))}월`, true)}
            {previousKnown && bar(before, `${Number(shiftMonth(month, -1).slice(5))}월`, false)}
            <div className="analysis-stackbar-scale" aria-hidden="true">
              <span />
              <div>
                <span>0%</span>
                <span>50%</span>
                <span>{base > 100 ? `${Math.round(base)}%` : '100%'}</span>
              </div>
            </div>
          </div>
          <ul className="analysis-composition-list">
            {rows.map((r) => (
              <li key={r.key}>
                <span className="analysis-composition-name">
                  <i className="analysis-key" style={{ background: r.color }} />
                  <span>
                    {r.name}
                    <small>{amount(r.value)}</small>
                  </span>
                </span>
                <b>{pct(r.rate)}</b>
                <PointDelta value={r.change} />
              </li>
            ))}
            <li className="analysis-composition-sum">
              <span className="analysis-composition-name">식재료비 + 인건비</span>
              <b>{pct(prime)}</b>
              <span />
            </li>
            <li className="analysis-composition-sum">
              <span className="analysis-composition-name">
                <span>
                  {now.operatingProfit != null ? '남는 비율 (예시)' : '비용 합계'}
                  <small>
                    {now.operatingProfit != null
                      ? `영업손익 ${amount(now.operatingProfit)}`
                      : amount(now.totalCost)}
                  </small>
                </span>
              </span>
              <b>{now.operatingProfit != null ? pct(100 - totalRate) : pct(totalRate)}</b>
              <span />
            </li>
          </ul>
          <p className="analysis-chart-note">
            {base > 100
              ? '비용 합계가 매출을 넘었습니다. 세로선이 매출 100% 위치입니다.'
              : '%p는 전월 비율과의 차이입니다. 남는 비율은 예시 영업손익이며 순이익이 아닙니다.'}
          </p>
        </div>
      ) : (
        <Empty title="매출과 모든 비용 항목이 필요합니다" />
      )}
    </section>
  );
}

/** Growth rates side by side on one centred scale, so "costs grew faster than sales" is visible. */
function Variance({
  now,
  before,
  month,
  profitLabel,
  profit,
}: {
  now: Metrics;
  before: Metrics;
  month: string;
  profitLabel: string;
  profit: (m: Metrics) => number | null;
}) {
  const rows = [
    {
      key: 'sales',
      name: '순매출',
      color: SALES,
      current: now.sales,
      previous: before.sales,
      goodWhen: 'up' as const,
    },
    ...costs.map((c) => ({
      key: c.key,
      name: c.name,
      color: c.color,
      current: now[c.key],
      previous: before[c.key],
      goodWhen: 'down' as const,
    })),
    {
      key: 'profit',
      name: profitLabel,
      color: 'var(--text-tertiary)',
      current: profit(now),
      previous: profit(before),
      goodWhen: 'up' as const,
    },
  ].map((r) => ({ ...r, growth: growth(r.current, r.previous) }));
  const known = rows.filter((r) => r.growth != null);
  const bound = niceBound(Math.max(0.5, ...known.map((r) => Math.abs(r.growth!))));
  return (
    <section className="panel analysis-variance">
      <div className="analysis-panel-head">
        <div>
          <h2>전월 대비 변동</h2>
          <p>
            {monthLabel(shiftMonth(month, -1))} → {monthLabel(month)} · 막대는 증감률 (가운데 0%)
          </p>
        </div>
      </div>
      {known.length ? (
        <>
          <ul className="analysis-variance-list">
            {rows.map((r) => {
              const width = r.growth == null ? 0 : (Math.abs(r.growth) / bound) * 50;
              const diff = r.current != null && r.previous != null ? r.current - r.previous : null;
              return (
                <li key={r.key}>
                  <div className="analysis-variance-name">
                    <span>
                      <i className="analysis-key" style={{ background: r.color }} />
                      {r.name}
                    </span>
                    <small>{amount(r.current)}</small>
                  </div>
                  <div className="analysis-diverge" aria-hidden="true">
                    {r.growth != null && (
                      <span
                        style={{
                          width: `${width}%`,
                          left: r.growth >= 0 ? '50%' : `${50 - width}%`,
                          background: r.color,
                        }}
                      />
                    )}
                  </div>
                  <div className="analysis-variance-value">
                    <DeltaChip current={r.current} previous={r.previous} goodWhen={r.goodWhen} />
                    <small>{diff == null ? '—' : `${diff > 0 ? '+' : ''}${won(diff)}`}</small>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="analysis-diverge-scale" aria-hidden="true">
            <span />
            <div>
              <span>−{bound}%</span>
              <span>0</span>
              <span>+{bound}%</span>
            </div>
            <span />
          </div>
        </>
      ) : (
        <Empty title="비교할 비용 자료가 없습니다" />
      )}
    </section>
  );
}
