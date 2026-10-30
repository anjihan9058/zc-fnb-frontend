import { useState, type FormEvent } from 'react';
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import type { AnalysisPreviewModel } from '../app/useAnalysisPreview';
import { financialMetrics, monthLabel, ratio, type FinancialMonth } from '../shared/analytics';
import { MAX_FINANCIAL_AMOUNT, parseFinancialAmount } from '../shared/financialInputs';
import { won } from '../shared/format';
import { createId } from '../shared/id';

const amountText = (value: number | null) => (value == null ? '' : String(value));
export function FinancialInputsEditor({ model }: { model: AnalysisPreviewModel }) {
  const row = model.dataset.financials.find((r) => r.month === model.month);
  if (model.mode !== 'demo' || !row) return null;
  return (
    <details className="panel financial-inputs">
      <summary>
        <span>매출·비용 입력 / 수정</span>
        <small role="status">
          {model.hasFinancialInput ? '직접 입력 적용됨' : '기본 가상 데이터'}
        </small>
      </summary>
      <div className="financial-inputs-body">
        <p className="financial-inputs-note">
          {model.workspace.name} · {monthLabel(model.month)}의 테스트 금액입니다. 적용하면 아래
          지표·차트·분석에 함께 반영됩니다. 이 브라우저에만 저장되며 실제 장부·영수증·근무표는
          변경하지 않습니다.
        </p>
        <FinancialInputsForm
          key={`${model.workspace.id}:${model.month}:${JSON.stringify(row)}`}
          row={row}
          model={model}
        />
      </div>
    </details>
  );
}

function FinancialInputsForm({ row, model }: { row: FinancialMonth; model: AnalysisPreviewModel }) {
  const [sales, setSales] = useState(amountText(row.net_sales));
  const [food, setFood] = useState(amountText(row.food_cost));
  const [labor, setLabor] = useState(amountText(row.labor_cost));
  const [expenses, setExpenses] = useState(
    row.expenses.map((e) => ({ ...e, amount: amountText(e.amount) })),
  );
  const [complete, setComplete] = useState(row.operating_expenses_complete);
  const [submitted, setSubmitted] = useState(false);
  const [storageError, setStorageError] = useState('');
  let input: FinancialMonth | undefined,
    validation = '';
  try {
    input = {
      month: row.month,
      entry_source: 'manual',
      net_sales: parseFinancialAmount(sales),
      food_cost: parseFinancialAmount(food),
      labor_cost: parseFinancialAmount(labor),
      expenses: expenses.map((e) => {
        if (!e.name.trim()) throw new Error('운영비 항목 이름을 입력해 주세요.');
        return { id: e.id, name: e.name.trim(), amount: parseFinancialAmount(e.amount) };
      }),
      operating_expenses_complete: complete,
    };
    if (complete && !expenses.length)
      throw new Error('운영비가 없으면 ‘기타 운영비’ 항목에 0원을 입력해 주세요.');
  } catch (error) {
    validation = (error as Error).message;
  }
  const metrics = financialMetrics(validation ? undefined : input);
  const fields = [
    { label: '총매출', value: sales, set: setSales, hint: '할인·환불·부가세를 제외한 순매출' },
    {
      label: '식재료비',
      value: food,
      set: setFood,
      hint: '이번 달 사용한 재료의 원가 · 매입 합계와 다를 수 있음',
    },
    { label: '인건비', value: labor, set: setLabor, hint: '이번 달 급여·수당 등 인건비 총액' },
  ];
  function apply(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    setStorageError('');
    if (validation || !input) return;
    try {
      model.saveFinancialInput(input);
    } catch {
      setStorageError(
        '브라우저 저장에 실패했습니다. 저장 공간·접근 설정을 확인한 뒤 다시 적용해 주세요.',
      );
    }
  }
  function reset() {
    try {
      model.resetFinancialInput();
    } catch {
      setStorageError('초기화 내용을 저장하지 못했습니다. 다시 시도해 주세요.');
    }
  }
  return (
    <form onSubmit={apply} noValidate>
      <div className="financial-input-grid">
        {fields.map((f) => (
          <label key={f.label}>
            <span>
              {f.label} <small>원</small>
            </span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max={MAX_FINANCIAL_AMOUNT}
              step="1"
              aria-label={`${f.label} 입력`}
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
              placeholder="미입력"
            />
            <small>{f.hint}</small>
          </label>
        ))}
      </div>
      <fieldset className="financial-expenses">
        <legend>
          기타 운영비 <small>원</small>
        </legend>
        {expenses.map((expense, index) => (
          <div className="financial-expense-row" key={expense.id}>
            <input
              aria-label={`운영비 ${index + 1} 항목`}
              value={expense.name}
              maxLength={80}
              placeholder="예: 임대료"
              onChange={(e) =>
                setExpenses(
                  expenses.map((v, i) => (i === index ? { ...v, name: e.target.value } : v)),
                )
              }
            />
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max={MAX_FINANCIAL_AMOUNT}
              step="1"
              aria-label={`운영비 ${index + 1} 금액`}
              value={expense.amount}
              placeholder="미입력"
              onChange={(e) =>
                setExpenses(
                  expenses.map((v, i) => (i === index ? { ...v, amount: e.target.value } : v)),
                )
              }
            />
            <button
              type="button"
              className="icon-btn"
              aria-label={`운영비 ${index + 1} 삭제`}
              onClick={() => setExpenses(expenses.filter((_, i) => i !== index))}
            >
              <Trash2 size={17} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn small"
          disabled={expenses.length >= 100}
          onClick={() => setExpenses([...expenses, { id: createId(), name: '', amount: '' }])}
        >
          <Plus size={15} /> 운영비 추가
        </button>
      </fieldset>
      <label className="financial-complete">
        <input type="checkbox" checked={complete} onChange={(e) => setComplete(e.target.checked)} />
        이 달의 기타 운영비를 모두 입력했습니다
      </label>
      <p className="financial-inputs-note">
        빈칸은 자료 없음, 0원은 비용 없음입니다. 매출·비용이 누락되거나 운영비 입력이 완료되지
        않으면 영업손익을 계산하지 않습니다.
      </p>
      <dl className="financial-input-preview" aria-label="입력값 계산 미리보기" aria-live="polite">
        <div>
          <dt>예상 총비용</dt>
          <dd>{metrics.totalCost == null ? '계산 보류' : won(metrics.totalCost)}</dd>
        </div>
        <div>
          <dt>예상 영업손익</dt>
          <dd>{metrics.operatingProfit == null ? '계산 보류' : won(metrics.operatingProfit)}</dd>
        </div>
        <div>
          <dt>예상 영업이익률</dt>
          <dd>
            {ratio(metrics.operatingProfit, metrics.sales)?.toFixed(1) ?? '—'}
            {ratio(metrics.operatingProfit, metrics.sales) != null ? '%' : ''}
          </dd>
        </div>
      </dl>
      <p className="financial-inputs-note">
        영업손익 = 총매출 − 식재료비 − 인건비 − 기타 운영비 · 금융비용·법인세 등 미포함
      </p>
      {(storageError || (submitted && validation)) && (
        <p role="alert">{storageError || validation}</p>
      )}
      <div className="financial-input-actions">
        <button type="submit" className="btn primary">
          <Save size={16} /> 입력값 적용
        </button>
        <button type="button" className="btn" onClick={reset} disabled={!model.hasFinancialInput}>
          <RotateCcw size={15} /> 이 달 기본값으로 복원
        </button>
      </div>
    </form>
  );
}
