import { useState } from 'react';
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Check, Plus } from 'lucide-react';
import { useWorkspace } from '../app/WorkspaceProvider';
import { workspaceApi, isDemo } from '../shared/api';
import { selectWorkspace, type Workspace } from '../shared/workspaces';
import { ErrorState, Modal } from '../shared/ui';

export function WorkspaceDialog({ close }: { close: () => void }) {
  const active = useWorkspace();
  const query = useQueryClient();
  const mutating = useIsMutating();
  const list = query.getQueryData<Workspace[]>(['workspaces']) ?? [active];
  const [selected, setSelected] = useState(active.id);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<Error | null>(null);
  const create = useMutation({
    mutationFn: () => workspaceApi.create(name, address),
    onSuccess: (workspace) => {
      query.setQueryData<Workspace[]>(['workspaces'], (old) => [...(old ?? []), workspace]);
      setSelected(workspace.id); setName(''); setAddress(''); setAdding(false);
    },
  });
  function switchWorkspace() {
    if (mutating || selected === active.id) return;
    if (document.querySelector('[data-unsaved="true"]')) {
      setError(new Error('저장하지 않은 변경이 있습니다. 현재 화면에서 먼저 저장해 주세요.'));
      return;
    }
    try {
      selectWorkspace(selected);
      window.location.assign('/dashboard');
    } catch { setError(new Error('사업장 선택을 저장할 수 없습니다. 브라우저 저장소 설정을 확인해 주세요.')); }
  }
  return <Modal title="사업장 선택" dirty={adding && (!!name || !!address)} busy={create.isPending} close={close}>
    <p className="muted">사업장마다 채팅, 영수증, 가격 기록, 직원과 근무표를 따로 관리합니다.</p>
    <div className="workspace-options" role="radiogroup" aria-label="사업장">
      {list.map((w) => <button type="button" role="radio" aria-checked={selected === w.id} className={selected === w.id ? 'selected' : ''} key={w.id} disabled={!!mutating} onClick={() => { setSelected(w.id); setError(null); }}>
        <Building2 size={21} /><span><strong>{w.name}</strong><small>{w.address || '주소 미등록'}{w.id === active.id ? ' · 현재 사업장' : ''}</small></span>{selected === w.id && <Check size={18} />}
      </button>)}
    </div>
    {adding ? <form className="workspace-create" onSubmit={(e) => { e.preventDefault(); if (!mutating) create.mutate(); }}>
      <label className="field">사업장 이름<input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} disabled={create.isPending} placeholder="예: ZC FNB 해운대점" /></label>
      <label className="field">주소 (선택)<input maxLength={200} value={address} onChange={(e) => setAddress(e.target.value)} disabled={create.isPending} /></label>
      <div className="upload-actions"><button type="button" className="btn" disabled={create.isPending} onClick={() => setAdding(false)}>취소</button><button className="btn primary" disabled={!name.trim() || !!mutating || !navigator.onLine}>{create.isPending ? '등록 중…' : '사업장 추가'}</button></div>
    </form> : <button className="btn full" disabled={!!mutating} onClick={() => setAdding(true)}><Plus size={16} />새 사업장 추가</button>}
    {(error || create.error) && <ErrorState error={error || create.error} />}
    <p className="muted text-small">전환하면 대시보드로 이동합니다. 현재 편집 중인 내용은 먼저 저장하세요.{isDemo && ' 데모 사업장은 이 브라우저에 저장됩니다.'}</p>
    <button className="btn primary full" disabled={selected === active.id || !!mutating || adding} onClick={switchWorkspace}>선택한 사업장으로 전환</button>
  </Modal>;
}
