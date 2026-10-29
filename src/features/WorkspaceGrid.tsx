import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3, Search } from 'lucide-react';
import { Empty } from '../shared/ui';
export interface GridColumn<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  sort?: (a: T, b: T) => number;
  numeric?: boolean;
}
export function WorkspaceGrid<T>({
  rows,
  columns,
  getId,
  searchText,
  selectedId,
  onSelect,
  empty = '표시할 기록이 없습니다',
  actions,
}: {
  rows: T[];
  columns: GridColumn<T>[];
  getId: (row: T) => string;
  searchText: (row: T) => string;
  selectedId?: string;
  onSelect?: (row: T) => void;
  empty?: string;
  actions?: ReactNode;
}) {
  const [search, setSearch] = useState(''),
    [visible, setVisible] = useState(() => columns.map((c) => c.key)),
    [columnOpen, setColumnOpen] = useState(false),
    [page, setPage] = useState(0),
    [sort, setSort] = useState<{ key: string; asc: boolean } | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!columnOpen) return;
    const close = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node)) setColumnOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [columnOpen]);
  const matched = rows.filter((row) =>
    searchText(row).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const col = columns.find((c) => c.key === sort?.key);
  if (col?.sort && sort) matched.sort((a, b) => col.sort!(a, b) * (sort.asc ? 1 : -1));
  const shownColumns = columns.filter((c) => visible.includes(c.key));
  const lastPage = Math.max(0, Math.ceil(matched.length / 10) - 1),
    currentPage = Math.min(page, lastPage),
    shown = matched.slice(currentPage * 10, currentPage * 10 + 10);
  return (
    <div className="workspace-grid">
      <div className="grid-toolbar">
        <label className="grid-search">
          <Search size={15} />
          <input
            aria-label="표 검색"
            placeholder="검색"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <div
          className="grid-column-control"
          ref={menu}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setColumnOpen(false);
          }}
        >
          <button
            className="grid-tool"
            aria-expanded={columnOpen}
            onClick={() => setColumnOpen(!columnOpen)}
          >
            <Columns3 size={14} />열 설정
            <span>
              {visible.length}/{columns.length}
            </span>
          </button>
          {columnOpen && (
            <fieldset className="grid-column-menu">
              <legend>표에 표시할 열</legend>
              {columns.map((column) => (
                <label key={column.key}>
                  <input
                    type="checkbox"
                    checked={visible.includes(column.key)}
                    disabled={visible.length === 1 && visible.includes(column.key)}
                    onChange={() =>
                      setVisible((old) =>
                        old.includes(column.key)
                          ? old.filter((k) => k !== column.key)
                          : [...old, column.key],
                      )
                    }
                  />
                  {column.label}
                </label>
              ))}
            </fieldset>
          )}
        </div>
        <div className="grid-toolbar-actions">{actions}</div>
      </div>
      <div className="workspace-grid-scroll">
        <table>
          <thead>
            <tr>
              {shownColumns.map((column) => (
                <th key={column.key} className={column.numeric ? 'numeric' : ''}>
                  {column.sort ? (
                    <button
                      onClick={() =>
                        setSort((old) => ({
                          key: column.key,
                          asc: old?.key === column.key ? !old.asc : true,
                        }))
                      }
                    >
                      {column.label}
                      {sort?.key === column.key ? (
                        sort.asc ? (
                          <ArrowUp size={12} />
                        ) : (
                          <ArrowDown size={12} />
                        )
                      ) : null}
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={getId(row)} aria-selected={getId(row) === selectedId}>
                {shownColumns.map((column, index) => (
                  <td
                    key={column.key}
                    className={column.numeric ? 'numeric' : ''}
                    data-label={column.label}
                  >
                    {index === 0 && onSelect ? (
                      <button className="grid-row-link" onClick={() => onSelect(row)}>
                        {column.render(row)}
                      </button>
                    ) : (
                      column.render(row)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!matched.length && (
        <Empty title={empty}>
          <p>
            {search
              ? '검색어를 바꿔 다시 확인해 주세요.'
              : '등록된 자료가 있으면 이곳에서 확인할 수 있습니다.'}
          </p>
        </Empty>
      )}
      <footer className="grid-pagination">
        <span>
          {matched.length ? currentPage * 10 + 1 : 0}–
          {Math.min((currentPage + 1) * 10, matched.length)} / {matched.length}건
        </span>
        <button
          className="icon-btn"
          disabled={!currentPage}
          aria-label="이전 페이지"
          onClick={() => setPage(currentPage - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          className="icon-btn"
          disabled={currentPage === lastPage}
          aria-label="다음 페이지"
          onClick={() => setPage(currentPage + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </footer>
    </div>
  );
}
