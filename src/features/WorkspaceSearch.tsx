import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ArrowUpRight } from 'lucide-react';
import { workspaceModules } from '../app/workspaceNavigation';
import { Modal } from '../shared/ui';
export function WorkspaceSearch({ room, close }: { room: string; close: () => void }) {
  const [search, setSearch] = useState('');
  const pages = [
    ...new Map(
      workspaceModules(room)
        .flatMap((m) =>
          m.groups.flatMap((g) =>
            g.items.map((item) => ({ ...item, module: m.name, group: g.name })),
          ),
        )
        .map((page) => [page.to, page]),
    ).values(),
  ];
  const shown = pages.filter((page) =>
    `${page.name} ${page.module} ${page.group}`.includes(search.trim()),
  );
  return (
    <Modal title="페이지 검색" close={close}>
      <label className="workspace-search-input">
        <Search size={19} />
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="문서, 원가, 은행, 근무표 검색"
          aria-label="페이지 검색어"
        />
      </label>
      <div className="workspace-search-results">
        {shown.map((page) => (
          <Link to={page.to} key={page.to} onClick={close}>
            <div>
              <strong>{page.name}</strong>
              <small>
                {page.module} / {page.group}
              </small>
            </div>
            <ArrowUpRight size={16} />
          </Link>
        ))}
        {!shown.length && <p className="muted">일치하는 페이지가 없습니다.</p>}
      </div>
    </Modal>
  );
}
