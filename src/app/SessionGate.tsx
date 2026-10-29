import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi, isDemo } from '../shared/api';
import { demoUser, type SessionUser } from '../shared/auth';
import { ErrorState, Loading, Modal } from '../shared/ui';
import { LoginForm, LoginPage } from '../pages/LoginPage';
import { safeReturnTo } from '../shared/navigation';
const SessionContext = createContext<SessionUser>(demoUser);
export const useSessionUser = () => useContext(SessionContext);
export function SessionGate({ children }: { children: ReactNode }) {
  const location = useLocation(); const client = useQueryClient();
  const previousUser = useRef<SessionUser | null>(null);
  const session = useQuery({ queryKey: ['session'], queryFn: authApi.session, enabled: !isDemo && location.pathname !== '/login', retry: false, staleTime: 60000 });
  useEffect(() => {
    if (isDemo) return;
    const expired = () => client.setQueryData(['session'], null);
    window.addEventListener('zcfnb:session-expired', expired);
    return () => window.removeEventListener('zcfnb:session-expired', expired);
  }, [client]);
  if (location.pathname === '/login') return <LoginPage />;
  if (isDemo) return <SessionContext.Provider value={demoUser}>{children}</SessionContext.Provider>;
  if (session.data) previousUser.current = session.data;
  if (!previousUser.current && session.isPending) return <Loading />;
  if (!previousUser.current && session.error) return <div className="login-page"><div className="login-panel"><h1>로그인 상태를 불러오지 못했습니다</h1><ErrorState error={session.error} retry={() => session.refetch()} /></div></div>;
  if (!previousUser.current && !session.data) return <Navigate replace to={`/login?returnTo=${encodeURIComponent(safeReturnTo(`${location.pathname}${location.search}${location.hash}`))}`} />;
  const user = session.data ?? previousUser.current!;
  return <SessionContext.Provider value={user}>{children}
    {!session.data && <Modal title="다시 로그인해 주세요" dismissible={false} close={() => {}}>
      <p className="muted">현재 화면의 입력을 유지하고 있습니다. 같은 계정으로 로그인하면 이어서 검토할 수 있습니다. 다른 계정으로 로그인하면 해당 계정의 대시보드로 이동합니다.</p>
      <LoginForm authenticated={async (next) => {
        if (next.id !== user.id) { client.clear(); window.location.replace('/dashboard'); return; }
        client.setQueryData(['session'], next);
        await client.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
      }} />
    </Modal>}
  </SessionContext.Provider>;
}
