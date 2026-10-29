import { ArrowRight, Pencil } from 'lucide-react';
import type { MenuCost, MenuRecipe } from '../shared/operations';
import { won } from '../shared/format';
export function MenuCostTable({
  items,
  open,
  edit,
}: {
  items: MenuCost[];
  open: (id: string) => void;
  edit: (menu: MenuRecipe) => void;
}) {
  return (
    <div className="panel menu-cost-table">
      <table>
        <thead>
          <tr>
            <th>메뉴</th>
            <th className="numeric">판매가격</th>
            <th className="numeric">식재료 원가</th>
            <th className="numeric">원가율</th>
            <th className="numeric">예상 식재료 마진율</th>
            <th className="numeric">직전 단가 기준 대비</th>
            <th className="numeric">내역</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.menu.id}>
              <td>
                <strong>{item.menu.name}</strong>
                <small>
                  {item.menu.ingredients.length}개 재료
                  {item.issues.length > 0 && ` · ${item.issues.join(' · ')}`}
                </small>
              </td>
              <td className="numeric">
                {item.menu.selling_price == null ? '미설정' : won(item.menu.selling_price)}
              </td>
              <td className="numeric">
                {item.ingredient_cost == null ? '계산 대기' : won(Math.round(item.ingredient_cost))}
              </td>
              <td className="numeric cost-rate-cell">
                {item.cost_rate == null ? '확인 필요' : `${item.cost_rate.toFixed(1)}%`}
              </td>
              <td className="numeric">
                {item.margin_rate == null ? '계산 대기' : `${item.margin_rate.toFixed(1)}%`}
              </td>
              <td
                className={`numeric ${
                  item.price_change_amount != null && item.price_change_amount > 0 ? 'up' : ''
                }`}
              >
                {item.price_change_amount == null
                  ? '비교 대기'
                  : `${item.price_change_amount > 0 ? '+' : ''}${won(Math.round(item.price_change_amount))}`}
              </td>
              <td className="numeric">
                <div className="table-row-actions">
                  <button
                    className="btn small"
                    aria-label={`${item.menu.name} 수정`}
                    onClick={() => edit(structuredClone(item.menu))}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    className="btn small"
                    aria-label={`${item.menu.name} 계산 내역`}
                    onClick={() => open(item.menu.id)}
                  >
                    <ArrowRight size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
