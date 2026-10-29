import { AlertTriangle, Pencil } from 'lucide-react';
import { warnings, won } from '../shared/format';
import type { ReceiptItem } from '../shared/types';

export function ReceiptItemsTable({
  items,
  locked,
  edit,
}: {
  items: ReceiptItem[];
  locked: boolean;
  edit: (item: ReceiptItem) => void;
}) {
  return (
    <div className="receipt-items-table">
      <table>
        <thead>
          <tr>
            <th>원문 · 연결 품목</th>
            <th>수량</th>
            <th>단가</th>
            <th>금액</th>
            <th>확인할 내용</th>
            <th>수정</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className={item.status === 'NEEDS_REVIEW' ? 'row-needs-review' : ''}>
              <td data-label="품목">
                <strong>{item.normalized_name || '표준 품목 미연결'}</strong>
                <small>{item.raw_name}</small>
              </td>
              <td data-label="수량">
                {item.quantity ?? '미확인'} {item.unit || '단위 미확인'}
              </td>
              <td data-label="단가">{won(item.unit_price)}</td>
              <td data-label="금액">{won(item.line_total)}</td>
              <td data-label="확인할 내용">
                <div className="table-issues">
                  {!item.warnings.length ? (
                    <span className="muted">확인 완료</span>
                  ) : (
                    item.warnings.map((code) => (
                      <span key={code}>
                        <AlertTriangle size={12} />
                        {warnings[code] || '원본 확인 필요'}
                      </span>
                    ))
                  )}
                </div>
                {item.comparison && (
                  <small className="comparison-inline">
                    직전 {won(item.comparison.previous_price)} / {item.comparison.comparison_unit}
                    <br />
                    {item.comparison.previous_date} ·{' '}
                    <b className={item.comparison.change_pct > 0 ? 'up' : 'down'}>
                      {item.comparison.change_pct > 0 ? '+' : ''}
                      {item.comparison.change_pct.toFixed(1)}%
                    </b>
                  </small>
                )}
              </td>
              <td>
                <button className="btn small" disabled={locked} onClick={() => edit(item)}>
                  <Pencil size={13} />
                  수정
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
