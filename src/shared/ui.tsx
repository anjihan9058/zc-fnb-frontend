import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from './errors';
import { confirmDiscard } from './navigation';
import { AlertCircle, Check, LoaderCircle, X, Inbox } from 'lucide-react';
import type { ReceiptStatus } from './types';
import { statuses } from './format';
export function Badge({ status }: { status: ReceiptStatus }) {
  return (
    <span className={`badge status-${status}`}>
      {['PROCESSING', 'UPLOADED'].includes(status) ? (
        <LoaderCircle size={12} className="spin" />
      ) : (
        <span className="status-dot" />
      )}
      {statuses[status]}
    </span>
  );
}
export function Loading() {
  return (
    <div className="empty" role="status">
      <LoaderCircle className="spin" size={28} />
      <p>불러오는 중입니다</p>
    </div>
  );
}
export function ErrorState({ error, retry }: { error: Error | null; retry?: () => void }) {
  const apiError = error instanceof ApiError ? error : null;
  const fieldLabels: Record<string, string> = { quantity: '수량', unit_price: '단가', line_total: '행 금액', name: '이름', unit: '단위', selling_price: '판매가격', checked_by: '검수 담당자', received_on: '입고 날짜', starts_at: '출근 시각', ends_at: '퇴근 시각', break_minutes: '휴게 시간', email: '이메일', password: '비밀번호' };
  return (
    <div className="error-box" role="alert">
      <AlertCircle size={19} />
      <div className="error-details"><span>{error?.message || '요청에 실패했습니다.'}</span>
        {apiError?.resultUnknown && <p>서버에 저장되었을 수 있습니다. 입력을 보관하고 목록·처리 상태를 확인한 뒤 재시도해 주세요. 자동으로 재전송하지 않습니다.</p>}
        {!!Object.keys(apiError?.fields ?? {}).length && <ul>{Object.entries(apiError!.fields).map(([field, message]) => <li key={field}>{fieldLabels[field] ?? '입력 항목'}: {message}</li>)}</ul>}
        {apiError?.requestId && <small>문의용 요청 번호: {apiError.requestId}</small>}
      </div>
      {retry && (
        <button className="btn small" onClick={retry}>
          다시 시도
        </button>
      )}
    </div>
  );
}
export function ResourceError({ error, retry, to, label }: { error: Error; retry: () => void; to: string; label: string }) {
  return <div className="page"><ErrorState error={error} retry={retry} /><Link className="btn" to={to}>{label}</Link></div>;
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Inbox size={36} />
      <h3>{title}</h3>
      {children}
    </div>
  );
}
export function Modal({
  title,
  children,
  close,
  wide = false,
  dirty = false,
  busy = false,
  dismissible = true,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
  dirty?: boolean;
  busy?: boolean;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const requestClose = () => { if (dismissible && confirmDiscard(dirty, busy)) close(); };
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      el.close();
      document.body.style.overflow = old;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'wide' : ''}`}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) requestClose();
      }}
      aria-labelledby={titleId}
      data-unsaved={dirty}
      data-pending={busy}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        {dismissible && <button aria-label="닫기" className="icon-btn" disabled={busy} onClick={requestClose}>
          <X size={20} />
        </button>}
      </header>
      {children}
    </dialog>
  );
}
const ToastContext = createContext<(text: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (text) {
      const id = setTimeout(() => setText(''), 5000);
      return () => clearTimeout(id);
    }
  }, [text]);
  return (
    <ToastContext.Provider value={setText}>
      {children}
      {text && (
        <div className="toast" role="status">
          <Check size={18} />
          {text}
          <button onClick={() => setText('')} aria-label="알림 닫기">
            <X size={15} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
