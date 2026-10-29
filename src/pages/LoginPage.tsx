import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ReceiptText } from 'lucide-react';
import { authApi, isDemo } from '../shared/api';
import type { SessionUser } from '../shared/auth';
import { safeReturnTo } from '../shared/navigation';
import { ErrorState } from '../shared/ui';

export function LoginForm({ authenticated }: { authenticated: (user: SessionUser) => void | Promise<void> }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const login = useMutation({ mutationFn: () => authApi.login(email.trim(), password), onSuccess: async (user) => { setPassword(''); await authenticated(user); } });
  return <form onSubmit={(e) => { e.preventDefault(); if (!login.isPending) login.mutate(); }}>
    <label className="field">이메일<input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} disabled={login.isPending} /></label>
    <label className="field">비밀번호<input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={login.isPending} /></label>
    {login.error && <ErrorState error={login.error} />}
    <button className="btn primary full" disabled={login.isPending || !navigator.onLine}>{login.isPending ? '로그인 중…' : '로그인'}<ArrowRight size={18} /></button>
  </form>;
}

export function LoginPage() {
  const query = useQueryClient(); const navigate = useNavigate(); const location = useLocation();
  const destination = safeReturnTo(new URLSearchParams(location.search).get('returnTo'));
  return <div className="login-page"><section className="login-panel"><span className="login-logo"><ReceiptText size={28} />ZC FNB</span><h1>우리 가게의 운영을<br />조금 더 편하게.</h1><p>영수증부터 메뉴 원가, 팀 대화까지<br />한곳에서 확인하세요.</p>
    {isDemo ? <><div className="info-box">현재는 브라우저에 데이터를 저장하는 데모입니다. 실제 계정 로그인은 서버 연결 후 사용할 수 있습니다.</div><button className="btn primary full" onClick={() => navigate(destination, { replace: true })}>데모 시작<ArrowRight size={18} /></button></>
      : <LoginForm authenticated={(user) => { query.removeQueries({ predicate: (item) => item.queryKey[0] !== 'session' }); query.setQueryData(['session'], user); navigate(destination, { replace: true }); }} />}
    <small>로그인 후 요청한 화면으로 돌아갑니다. 사업장 접근 권한은 서버에서 확인합니다.</small>
  </section></div>;
}
