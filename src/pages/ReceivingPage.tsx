import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Check, ClipboardCheck, PackageCheck, Save } from 'lucide-react';
import { useReceiving, useRefresh } from '../app/hooks';
import { operationsApi } from '../shared/api';
import { receivingLabels, type ReceivingDocument } from '../shared/operations';
import { Empty, ErrorState, Loading, Modal, useToast } from '../shared/ui';
import { today } from '../shared/format';

export function ReceivingPage() {
  const query = useReceiving();
  const [params,setParams] = useSearchParams();
  const filter=params.get('status') ?? 'ALL';
  const setFilter=(value:string) => setParams(old=>{const next=new URLSearchParams(old); next.set('status',value); return next;},{replace:true});
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ReceivingDocument | null>(null);
  const rows = query.data?.filter((doc) => (filter === 'ALL' || (filter === 'OPEN' ? !doc.completed : filter === 'DONE' ? doc.completed : doc.status === filter)) && `${doc.supplier} ${doc.lines.map((line) => line.name).join(' ')}`.includes(search)) ?? [];
  return <div className="page receiving-page"><div className="page-heading"><div><h1>입고 검수</h1><p>명세서 수량과 실제 도착한 수량을 비교하고, 누락·오배송을 기록하세요.</p></div><span className="verified-label"><ClipboardCheck size={17} />현장 확인 기준</span></div>
    <div className="info-box"><PackageCheck size={20} /><span>입고 검수는 실제 물품 확인 기록입니다. <strong>검수 완료가 영수증 가격 승인으로 이어지지는 않습니다.</strong> 단가 없는 명세서도 수량을 확인할 수 있습니다.</span></div>
    <div className="operations-stats"><div><span>검수 대기·진행</span><strong>{query.data?.filter((doc) => !doc.completed).length ?? 0}건</strong></div><div><span>누락·오배송</span><strong>{query.data?.filter((doc) => ['SHORTAGE', 'WRONG_ITEM'].includes(doc.status)).length ?? 0}건</strong></div><div><span>검수 완료</span><strong>{query.data?.filter((doc) => doc.completed).length ?? 0}건</strong></div></div>
    <div className="operations-filter"><label className="field">거래처·품목 검색<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="거래처 또는 품목" /></label><label className="field">검수 상태<select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="ALL">전체</option><option value="OPEN">검수 대기·진행</option><option value="SHORTAGE">일부 누락</option><option value="WRONG_ITEM">오배송</option><option value="DONE">검수 완료</option></select></label></div>
    <section className="panel">{query.isPending && <Loading />}{query.error && <ErrorState error={query.error} retry={() => query.refetch()} />}{query.data && !rows.length && <Empty title={query.data.length ? '조건에 맞는 검수 내역이 없습니다' : '검수할 영수증이 없습니다'}><p>영수증 분석이 끝나면 입고 수량을 확인할 수 있습니다.</p><Link className="btn" to="/receipts">영수증 보관함</Link></Empty>}
      {!!rows.length && <div className="table-scroll"><table><thead><tr><th>거래처</th><th>입고일</th><th className="numeric">품목</th><th>검수 상태</th><th>담당자</th><th>확인</th></tr></thead><tbody>{rows.map((doc) => <tr key={doc.receipt_id}><td><strong>{doc.supplier}</strong><small className="receiving-price-status">가격 {doc.receipt_status === 'APPROVED' ? '승인 완료' : '미승인'}</small></td><td>{doc.received_on || '미확인'}</td><td className="numeric">{doc.lines.length}개</td><td><span className={`receiving-badge receiving-${doc.status}`}>{receivingLabels[doc.status]}</span>{doc.completed && doc.status !== 'COMPLETED' && <small className="receiving-price-status">검수 기록 확정됨</small>}</td><td>{doc.checked_by || '미기재'}</td><td><button className="btn small" onClick={() => setEditing(structuredClone(doc))}>{doc.completed ? '내역 보기' : '수량 검수'}<ArrowRight size={14} /></button></td></tr>)}</tbody></table></div>}
    </section>{editing && <ReceivingEditor document={editing} close={() => setEditing(null)} />}
  </div>;
}
function ReceivingEditor({ document: initial, close }: { document: ReceivingDocument; close: () => void }) {
  const [doc, setDoc] = useState(() => structuredClone(initial));
  const [saved, setSaved] = useState(() => structuredClone(initial));
  const [confirming, setConfirming] = useState(false);
  const refresh = useRefresh(); const toast = useToast();
  const dirty = JSON.stringify(doc) !== JSON.stringify(saved);
  const finishIssues = [
    ...(!doc.received_on ? ['입고 날짜를 입력해 주세요.'] : []), ...(!doc.checked_by.trim() ? ['검수 담당자를 입력해 주세요.'] : []),
    ...(!doc.lines.length ? ['확인할 품목이 없습니다.'] : []),
    ...doc.lines.flatMap((line, index) => [
      ...(line.expected_quantity == null || line.expected_quantity <= 0 || !line.unit ? [`${index + 1}행: 영수증에서 명세서 수량·단위를 먼저 확인해 주세요.`] : []),
      ...(line.actual_quantity == null || !Number.isFinite(line.actual_quantity) || line.actual_quantity < 0 ? [`${index + 1}행: 실제 수량을 입력해 주세요. 도착하지 않았다면 0을 입력하세요.`] : []),
      ...((line.wrong_item || (line.actual_quantity != null && line.actual_quantity !== line.expected_quantity)) && !line.note.trim() ? [`${index + 1}행: 수량 차이·오배송에 대한 비고를 입력해 주세요.`] : []),
    ]),
  ];
  const save = useMutation({
    mutationFn: (completed: boolean) => operationsApi.saveReceiving({ ...doc, completed }),
    onSuccess: async (result) => { setDoc(result); setSaved(structuredClone(result)); setConfirming(false); await refresh(); toast(result.completed ? '입고 검수 기록을 확정했습니다.' : '입고 검수 초안을 저장했습니다.'); },
  });
  function patchLine(id: string, value: Partial<ReceivingDocument['lines'][number]>) { setDoc((old) => ({ ...old, lines: old.lines.map((line) => line.item_id === id ? { ...line, ...value } : line) })); setConfirming(false); save.reset(); }
  return <Modal title={`${doc.supplier} · 입고 검수`} dirty={dirty} busy={save.isPending} close={close} wide>
    <div className="info-box">원본 명세서 수량과 실제 수량을 비교하세요. 이 기록은 구매가격과 메뉴 원가를 변경하지 않습니다.</div>
    <div data-unsaved={dirty}><fieldset disabled={save.isPending || doc.completed}><div className="form-grid"><label className="field">입고 날짜<input type="date" max={today()} value={doc.received_on} onChange={(e) => setDoc({ ...doc, received_on: e.target.value })} /></label><label className="field">검수 담당자<input maxLength={60} value={doc.checked_by} onChange={(e) => setDoc({ ...doc, checked_by: e.target.value })} placeholder="확인한 담당자 이름" /></label></div>
      <div className="receiving-editor-lines">{doc.lines.map((line, index) => <article key={line.item_id} className="receiving-editor-line"><div className="schedule-toolbar"><strong>{index + 1}. {line.name}</strong><span className="muted text-small">명세서 {line.expected_quantity ?? '미확인'} {line.unit}</span></div><div className="receiving-line-fields"><label className="field">실제 도착 수량<input type="number" min="0" step="any" value={line.actual_quantity ?? ''} onChange={(e) => patchLine(line.item_id, { actual_quantity: e.target.value === '' ? null : Number(e.target.value) })} placeholder="직접 확인 후 입력" /></label><div className="receiving-difference"><span>부족 수량</span><strong>{line.actual_quantity != null && line.expected_quantity != null ? Math.max(0, line.expected_quantity - line.actual_quantity) : '미확인'} {line.unit}</strong></div><label className="shift-reviewed"><input type="checkbox" checked={line.wrong_item} onChange={(e) => patchLine(line.item_id, { wrong_item: e.target.checked })} />다른 상품 도착·오배송</label></div>{line.actual_quantity != null && line.expected_quantity != null && line.actual_quantity > line.expected_quantity && <p className="review-hint">명세서보다 많이 도착했습니다. 비고에 내용을 남겨 주세요.</p>}<label className="field">비고<input maxLength={500} value={line.note} onChange={(e) => patchLine(line.item_id, { note: e.target.value })} placeholder="누락·오배송·수량 차이 내용" /></label></article>)}</div>
    </fieldset></div>
    <Link className="text-link" to={`/receipts/${doc.receipt_id}`}>원본 영수증 및 명세서 수량 확인<ArrowRight size={15} /></Link>
    {save.error && <ErrorState error={save.error} />}
    {doc.completed ? <div className="info-box"><Check size={17} />검수 기록이 확정되었습니다. {doc.checked_by} · {doc.checked_at && new Date(doc.checked_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</div> : <>
      {!!finishIssues.length && <div className="shift-issues"><strong>검수 확정 전 확인</strong><ul>{finishIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
      {confirming && <div className="receiving-confirm"><strong>실제 도착한 품목과 수량을 확인했나요?</strong><p>누락·오배송을 포함한 현재 검수 기록을 확정합니다.</p><div className="upload-actions"><button className="btn" disabled={save.isPending} onClick={() => setConfirming(false)}>돌아가기</button><button className="btn primary" disabled={save.isPending || finishIssues.length > 0 || !navigator.onLine} onClick={() => save.mutate(true)}>{save.isPending ? '확정 중…' : '확인하고 검수 확정'}</button></div></div>}
      {!confirming && <div className="upload-actions"><button className="btn" disabled={save.isPending || !navigator.onLine || !dirty} onClick={() => save.mutate(false)}><Save size={16} />초안 저장</button><button className="btn primary" disabled={save.isPending || finishIssues.length > 0 || !navigator.onLine} onClick={() => setConfirming(true)}><Check size={16} />검수 완료</button></div>}
    </>}
  </Modal>;
}
