import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Info, Minus, Sparkles } from 'lucide-react';
import type { AnalysisPreviewModel } from '../app/useAnalysisPreview';
import { monthLabel, growth, type AnalysisInsight } from '../shared/analytics';

/**
 * One filter row above everything it scopes. Extra controls (for example the
 * trend range on the financial dashboard) are passed as children so every
 * chart on the page answers to the same row.
 */
export function AnalysisFilters({
  model,
  children,
}: {
  model: AnalysisPreviewModel;
  children?: ReactNode;
}) {
  return (
    <div className="analysis-filterbar">
      <div className="analysis-filters" role="group" aria-label="분석 조건">
        <label className="analysis-filter analysis-filter-static">
          <span>사업장</span>
          <input readOnly value={model.workspace.name} />
        </label>
        <label className="analysis-filter">
          <span>기준 월</span>
          <select
            aria-label="분석 기준 월"
            value={model.month}
            onChange={(e) => model.setMonth(e.target.value)}
          >
            {model.months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </label>
        {children}
        <label className="analysis-filter">
          <span>데이터</span>
          <select
            aria-label="분석 데이터 보기"
            value={model.mode}
            onChange={(e) => model.setMode(e.target.value as 'demo' | 'missing')}
          >
            <option value="demo">가상 데이터</option>
            <option value="missing">자료 미연결</option>
          </select>
        </label>
      </div>
      <p className="analysis-source" data-mode={model.mode} role="note">
        <Info size={14} />
        {model.mode === 'demo' ? (
          <span>
            <strong>가상 데이터 · AI 응답 예시</strong> 실제 사업장 기록과 분리된 예시이며 실제 AI
            분석·서버 API는 호출하지 않습니다. 전월과 비교하며 금액은 원 단위입니다.
          </span>
        ) : (
          <span>
            <strong>분석 자료 미연결</strong> 매출·원가 월별 자료와 AI 응답이 연결되면 이 영역에
            표시합니다.
          </span>
        )}
      </p>
    </div>
  );
}

/** Splits the generated summary into one finding per sentence for scanning. */
const findings = (summary: string) =>
  summary
    .split(/(?<=\.)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

export function AiAnalysisCard({ insight }: { insight: AnalysisInsight }) {
  return (
    <section className="panel analysis-ai-card" aria-label="AI 분석 결과">
      <header className="analysis-ai-head">
        <span className="analysis-ai-icon" aria-hidden="true">
          <Sparkles size={18} />
        </span>
        <div>
          <h2>{insight.title}</h2>
          <p>{monthLabel(insight.month)} · 전월 비교</p>
        </div>
        <span className="analysis-badge">
          {insight.origin === 'demo-rule' ? '가상 AI 응답' : 'AI 분석'}
        </span>
      </header>
      <div className="analysis-ai-body">
        <ul className="analysis-ai-summary">
          {findings(insight.summary).map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
        <dl className="analysis-evidence">
          {insight.evidence.map((e, i) => (
            <div key={i}>
              <dt>{e.label}</dt>
              <dd>{e.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <ul className="analysis-limitations">
        {insight.limitations.map((text, i) => (
          <li key={i}>{text}</li>
        ))}
      </ul>
    </section>
  );
}

type Tone = 'good' | 'bad' | 'neutral';
const toneOf = (direction: 'up' | 'down' | 'flat' | 'none', goodWhen: 'up' | 'down'): Tone =>
  direction === 'up' || direction === 'down'
    ? (direction === 'up') === (goodWhen === 'up')
      ? 'good'
      : 'bad'
    : 'neutral';

/** Month-over-month change with an arrow; green or red by whether up is good. */
export function DeltaChip({
  current,
  previous,
  goodWhen = 'up',
}: {
  current: number | null;
  previous: number | null;
  goodWhen?: 'up' | 'down';
}) {
  const value = growth(current, previous);
  if (current == null && previous == null) return null;
  const direction =
    value == null ? 'none' : Math.abs(value) < 0.05 ? 'flat' : value > 0 ? 'up' : 'down';
  const Icon = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : Minus;
  return (
    <span
      className="analysis-delta"
      data-direction={direction}
      data-tone={toneOf(direction, goodWhen)}
      aria-label={
        value == null
          ? '전월 비교 자료 부족'
          : `전월 대비 ${value > 0 ? '+' : ''}${value.toFixed(1)}%`
      }
    >
      {value == null ? (
        previous === 0 ? (
          '전월 0원'
        ) : (
          '비교 불가'
        )
      ) : (
        <>
          <Icon size={12} strokeWidth={2.5} />
          {Math.abs(value).toFixed(1)}%
        </>
      )}
    </span>
  );
}

/** Percentage-point change, for rates such as a cost rate. */
export function PointDelta({
  value,
  digits = 1,
  goodWhen = 'down',
}: {
  value: number | null;
  digits?: number;
  goodWhen?: 'up' | 'down';
}) {
  const direction =
    value == null
      ? 'none'
      : Math.abs(value) < 0.5 / 10 ** digits
        ? 'flat'
        : value > 0
          ? 'up'
          : 'down';
  return (
    <span
      className="analysis-delta analysis-delta-point"
      data-direction={direction}
      data-tone={toneOf(direction, goodWhen)}
    >
      {value == null ? '비교 불가' : `${value > 0 ? '+' : ''}${value.toFixed(digits)}%p`}
    </span>
  );
}

/** Kept for callers that want the sentence form of the change. */
export function ChangeLabel({
  current,
  previous,
}: {
  current: number | null;
  previous: number | null;
}) {
  const value = growth(current, previous);
  return (
    <span
      className="analysis-change"
      data-direction={value == null ? 'none' : value > 0 ? 'up' : value < 0 ? 'down' : 'flat'}
    >
      {value == null
        ? previous === 0
          ? '전월 0원 · 증감률 계산 불가'
          : '전월 비교 자료 부족'
        : `전월 대비 ${value > 0 ? '+' : ''}${value.toFixed(1)}%`}
      {previous != null && previous < 0 && ' · 전월 절댓값 기준'}
    </span>
  );
}
