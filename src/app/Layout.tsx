import { Suspense, useEffect, useLayoutEffect, useState } from 'react';
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, PanelLeftClose, PanelLeftOpen, Plus, Search } from 'lucide-react';
import { workspaceModules, workspaceModuleId } from './workspaceNavigation';
import { WorkspaceSearch } from '../features/WorkspaceSearch';
import { UploadDialog } from '../features/UploadDialog';
import { ScheduleTextDialog } from '../features/ScheduleTextDialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  MessagesSquare,
  ChartNoAxesCombined,
  Carrot,
  ReceiptText,
  ChevronDown,
  ArrowUpRight,
  Bell,
  Settings,
  Download,
  WifiOff,
  Check,
  Smartphone,
  CalendarDays,
  Building2,
  ChefHat,
  PackageCheck,
  Grid2X2,
  Trash2,
} from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { authApi, isDemo } from '../shared/api';
import { useSummary } from './hooks';
import { ErrorState, Loading, Modal } from '../shared/ui';
import { useWorkspace } from './WorkspaceProvider';
import { WorkspaceDialog } from '../features/WorkspaceDialog';
import { useSessionUser } from './SessionGate';
import { NavigationGuard } from './NavigationGuard';
import { appThemes, useAppTheme } from './useAppTheme';
interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
const workspaceLinks = (room: string) => [
  { to: '/dashboard', icon: LayoutDashboard, name: '운영 홈' },
  { to: `/rooms/${encodeURIComponent(room)}`, icon: MessagesSquare, name: '우리 팀 채팅' },
  { to: '/receipts', icon: ReceiptText, name: '문서 · 구매' },
  { to: '/menus', icon: ChefHat, name: '메뉴 · 원가' },
  { to: '/receiving', icon: PackageCheck, name: '입고 검수' },
  { to: '/schedules', icon: CalendarDays, name: '근무표' },
  { to: '/prices', icon: ChartNoAxesCombined, name: '식재료 가격' },
  { to: '/products', icon: Carrot, name: '식재료 관리' },
];
export function Layout() {
  const navigate = useNavigate();
  const { theme, setTheme } = useAppTheme();
  const user = useSessionUser();
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: () => {
      if (document.querySelector('[data-unsaved="true"], [data-pending="true"]'))
        throw new Error('작성·전송 중인 내용을 먼저 저장하거나 취소한 뒤 로그아웃해 주세요.');
      return authApi.logout();
    },
    onSuccess: () => {
      queryClient.clear();
      window.location.assign('/login');
    },
  });
  const workspace = useWorkspace();
  const links = workspaceLinks(workspace.room_id);
  const mobileLinks = [
    { ...links[0], name: '홈' },
    { ...links[1], name: '채팅' },
    links.find((link) => link.to === '/schedules')!,
    { ...links[3], name: '원가' },
    { to: '/more', icon: Grid2X2, name: '더보기' },
  ];
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const location = useLocation();
  const modules = workspaceModules(workspace.room_id);
  const activeModule = modules.find((m) => m.id === workspaceModuleId(location.pathname))!;
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [pageSearch, setPageSearch] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<'receipt' | 'schedule' | null>(null);
  useEffect(() => setMobileMenu(false), [location.pathname]);
  const isChat = location.pathname.startsWith('/rooms/');
  useEffect(() => {
    document.body.classList.toggle('chat-route', isChat);
    return () => document.body.classList.remove('chat-route');
  }, [isChat]);
  const summary = useSummary();
  const [settings, setSettings] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [installed, setInstalled] = useState(
    () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      !!(navigator as Navigator & { standalone?: boolean }).standalone,
  );
  const [installing, setInstalling] = useState(false);
  const [pwaError, setPwaError] = useState<Error | null>(null);
  const [registered, setRegistered] = useState(false);
  const {
    needRefresh: [update],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setRegistered(true);
    },
    onRegisterError(error) {
      console.warn('[PWA] Service worker registration failed.', error);
      setPwaError(
        new Error('오프라인 준비에 실패했습니다. 연결 상태를 확인하고 앱을 다시 열어 주세요.'),
      );
    },
  });
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    const capture = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    const installed = () => {
      setInstall(null);
      setInstalled(true);
    };
    const display = window.matchMedia('(display-mode: standalone)');
    const displayChanged = () =>
      setInstalled(
        display.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone,
      );
    display.addEventListener('change', displayChanged);
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', installed);
      display.removeEventListener('change', displayChanged);
    };
  }, []);
  const current =
    activeModule.groups
      .flatMap((group) => group.items)
      .find((item) =>
        item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to),
      )?.name ?? activeModule.name;
  return (
    <div
      className={`app-shell r365-workspace ${isChat ? 'is-chat' : ''} ${navCollapsed ? 'nav-collapsed' : ''} ${mobileMenu ? 'mobile-menu-open' : ''}`}
    >
      <NavigationGuard />
      {mobileMenu && (
        <button
          className="module-menu-backdrop"
          aria-label="메뉴 닫기"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <nav className="module-rail" aria-label="업무 모듈">
        <Link className="rail-brand" to="/dashboard" aria-label="ZC FNB 홈">
          ZC
        </Link>
        {modules.map(({ id, name, icon: Icon, to }) => (
          <NavLink
            key={id}
            to={to}
            className={activeModule.id === id ? 'rail-item active' : 'rail-item'}
            aria-label={name}
            aria-current={activeModule.id === id ? 'page' : undefined}
          >
            <Icon size={21} />
            <span>{name}</span>
          </NavLink>
        ))}
        <button className="rail-settings" aria-label="앱 설정" onClick={() => setSettings(true)}>
          <Settings size={20} />
        </button>
      </nav>
      <aside className="sidebar">
        <Link to="/dashboard" className="brand">
          <span className="brand-mark">
            <ReceiptText size={25} />
          </span>
          ZC FNB<span className="brand-dot">.</span>
        </Link>
        <button
          type="button"
          className="workspace workspace-trigger"
          aria-label={`현재 ${workspace.name}. 사업장 선택 또는 추가`}
          aria-haspopup="dialog"
          aria-expanded={workspaceOpen}
          onClick={() => setWorkspaceOpen(true)}
        >
          <span className="store-avatar">{workspace.name.slice(0, 1)}</span>
          <div>
            <strong>{workspace.name}</strong>
            <small>사업장 선택·전환</small>
          </div>
          <span className="workspace-change">
            <Building2 size={15} />
            전환
          </span>
          <ChevronDown size={15} />
        </button>
        <div className="module-nav-title">
          {activeModule.name}
          <button
            className="icon-btn"
            aria-label="하위 메뉴 접기"
            onClick={() => {
              setNavCollapsed(true);
              setMobileMenu(false);
            }}
          >
            <PanelLeftClose size={16} />
          </button>
        </div>
        <nav aria-label="주 메뉴">
          {activeModule.groups.map((group) => (
            <details className="module-nav-group" key={group.name} open>
              <summary>{group.name}</summary>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.exact}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <span>{item.name}</span>
                  {item.to === '/receipts' && !!summary.data?.review && (
                    <b className="nav-count">{summary.data.review}</b>
                  )}
                </NavLink>
              ))}
            </details>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setSettings(true)}>
            <Settings size={19} />앱 설정 및 설치
          </button>
          <div className="profile">
            <span>{user.display_name.slice(0, 1)}</span>
            <div>
              <strong>{user.display_name}</strong>
              <small>{isDemo ? '데모 관리자' : '사업장 계정'}</small>
            </div>
            <span className="profile-indicator" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-btn module-mobile-toggle"
            aria-label="업무 메뉴 열기"
            aria-expanded={mobileMenu}
            onClick={() => setMobileMenu(!mobileMenu)}
          >
            <Menu size={21} />
          </button>
          <button
            className="icon-btn desktop-menu-toggle"
            aria-label={navCollapsed ? '하위 메뉴 펼치기' : '하위 메뉴 접기'}
            onClick={() => setNavCollapsed(!navCollapsed)}
          >
            {navCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <div className="breadcrumb">
            워크스페이스 <span>/</span>
            <strong>{current}</strong>
          </div>
          <Link className="mobile-brand" to="/dashboard">
            <ReceiptText size={23} />
            ZC FNB
          </Link>
          <div className="topbar-actions">
            <button className="global-page-search" onClick={() => setPageSearch(true)}>
              <Search size={16} />
              <span>페이지 검색</span>
              <kbd>검색</kbd>
            </button>
            <button className="global-create" onClick={() => setCreateOpen(true)}>
              <Plus size={18} />
              <span>새로 만들기</span>
            </button>
            <button
              className="mobile-workspace-trigger"
              aria-label={`사업장 선택: ${workspace.name}`}
              aria-haspopup="dialog"
              onClick={() => setWorkspaceOpen(true)}
            >
              {workspace.name}
              <ChevronDown size={14} />
            </button>
            <span className={`mode-tag ${isDemo ? '' : 'live'}`}>
              <span />
              {isDemo ? '데모 워크스페이스' : 'API 연결 모드'}
            </span>
            <button
              className="icon-btn notification-button"
              aria-label="검토 알림"
              onClick={() => setNotifications(true)}
            >
              <Bell size={20} />
              {!!summary.data?.review && <i />}
            </button>
            <button
              className="avatar-button"
              aria-label="내 계정 및 설정"
              onClick={() => setSettings(true)}
            >
              {user.display_name.slice(0, 1)}
            </button>
          </div>
        </header>
        {!online && (
          <div className="offline-banner" role="alert">
            <WifiOff size={16} />
            오프라인입니다. 저장·업로드·승인은 연결 후 다시 시도해 주세요.
          </div>
        )}
        {update && (
          <div className="update-banner">
            새 버전이 준비되었습니다. 편집을 저장한 뒤 업데이트해 주세요.
            <button
              className="btn small"
              onClick={async () => {
                if (document.querySelector('[data-unsaved="true"], [data-pending="true"]')) {
                  setPwaError(
                    new Error(
                      '작성 중인 내용이나 첨부 파일을 먼저 저장·전송한 뒤 업데이트해 주세요.',
                    ),
                  );
                  setSettings(true);
                  return;
                }
                try {
                  await updateServiceWorker(true);
                } catch {
                  setPwaError(new Error('업데이트에 실패했습니다. 연결 후 다시 시도해 주세요.'));
                  setSettings(true);
                }
              }}
            >
              업데이트
            </button>
          </div>
        )}
        <main>
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </main>
        <footer className="app-footer">
          <span>ZC FNB · 부산 지산학 협력 프로젝트</span>
          <span>{isDemo ? '가상 데이터 · 실제 OCR 및 인증 미연결' : '확정된 구매 기록 기준'}</span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="모바일 메뉴">
        {mobileLinks.map(({ to, icon: Icon, name }) => (
          <NavLink key={to} to={to}>
            <Icon size={21} />
            <span>
              {name
                .replace('우리 팀 ', '')
                .replace('영수증 보관함', '영수증')
                .replace('식재료 가격', '가격')}
            </span>
          </NavLink>
        ))}
      </nav>
      {workspaceOpen && <WorkspaceDialog close={() => setWorkspaceOpen(false)} />}
      {pageSearch && (
        <WorkspaceSearch room={workspace.room_id} close={() => setPageSearch(false)} />
      )}
      {createOpen && (
        <Modal title="새로 만들기" close={() => setCreateOpen(false)}>
          <div className="create-menu-grid">
            <button
              onClick={() => {
                setCreateOpen(false);
                setCreateType('receipt');
              }}
            >
              <ReceiptText size={22} />
              <strong>영수증 올리기</strong>
              <small>촬영·파일 첨부</small>
            </button>
            <button
              onClick={() => {
                setCreateOpen(false);
                setCreateType('schedule');
              }}
            >
              <CalendarDays size={22} />
              <strong>근무 현황 정리</strong>
              <small>긴 근무 내역 붙여넣기</small>
            </button>
            <button
              onClick={() => {
                setCreateOpen(false);
                navigate('/waste?new=1');
              }}
            >
              <Trash2 size={22} />
              <strong>폐기 기록</strong>
              <small>버린 식재료 기록</small>
            </button>
          </div>
        </Modal>
      )}
      {createType === 'receipt' && (
        <UploadDialog room={workspace.room_id} close={() => setCreateType(null)} />
      )}
      {createType === 'schedule' && (
        <ScheduleTextDialog text="" room={workspace.room_id} close={() => setCreateType(null)} />
      )}
      {notifications && (
        <Modal title="확인할 소식" close={() => setNotifications(false)}>
          <p className="muted">가격 이력에 반영하기 전, 아래 영수증을 확인해 주세요.</p>
          <div className="notice-list">
            {summary.data?.recent
              .filter((r) => r.status === 'NEEDS_REVIEW')
              .map((r) => (
                <Link
                  key={r.receipt_id}
                  to={`/receipts/${r.receipt_id}`}
                  onClick={() => setNotifications(false)}
                >
                  <span className="mini-icon amber">
                    <ReceiptText size={19} />
                  </span>
                  <span>
                    <strong>{r.supplier.name || '거래처 미확인'}</strong>
                    <small>
                      {r.items.filter((i) => i.status === 'NEEDS_REVIEW').length}개 항목 확인 필요
                    </small>
                  </span>
                  <ArrowUpRight size={18} />
                </Link>
              ))}
            {!summary.data?.review && <p>새로운 검토 알림이 없습니다.</p>}
          </div>
        </Modal>
      )}
      {settings && (
        <Modal title="앱 설정 및 설치" close={() => setSettings(false)}>
          <fieldset className="theme-preferences">
            <legend>화면 색상</legend>
            <div>
              {appThemes.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  aria-pressed={theme === choice.id}
                  onClick={() => setTheme(choice.id)}
                >
                  <span style={{ background: choice.color }} />
                  <strong>{choice.name}</strong>
                  {theme === choice.id && <Check size={15} />}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="install-hero">
            <Smartphone size={36} />
            <h3>손안에서 더 간편하게</h3>
            <p>
              ZC FNB를 홈 화면에 추가해
              <br />
              바로 촬영하고 확인하세요.
            </p>
          </div>
          {installed ? (
            <div className="info-box">
              <Check size={17} />
              설치된 앱으로 사용할 수 있습니다.
            </div>
          ) : !window.isSecureContext ? (
            <div className="info-box">
              현재 주소에서는 앱을 설치할 수 없습니다. 휴대폰 설치에는 HTTPS 주소가 필요합니다. PC의
              IP 주소로 접속한 HTTP 페이지는 화면 확인용입니다.
            </div>
          ) : install ? (
            <button
              className="btn primary full"
              disabled={installing}
              onClick={async () => {
                setInstalling(true);
                setPwaError(null);
                try {
                  await install.prompt();
                  await install.userChoice;
                } catch {
                  setPwaError(
                    new Error('설치 창을 열지 못했습니다. 브라우저 메뉴에서 설치를 선택해 주세요.'),
                  );
                } finally {
                  setInstall(null);
                  setInstalling(false);
                }
              }}
            >
              <Download size={17} />
              {installing ? '설치 창 열리는 중…' : '앱 설치'}
            </button>
          ) : (
            <div className="info-box">
              Chrome·Edge의 메뉴에서 ‘앱 설치’를, iPhone Safari에서는 ‘공유 → 홈 화면에 추가’를
              선택하세요. 설치 메뉴가 없으면 HTTPS 배포 환경에서 다시 확인하세요.
            </div>
          )}
          {pwaError && <ErrorState error={pwaError} />}
          <div className="settings-row">
            <span>오프라인 화면</span>
            <strong>
              {offlineReady
                ? '준비 완료'
                : registered
                  ? '등록 완료'
                  : import.meta.env.DEV
                    ? '개발 모드 · 빌드 후 사용'
                    : '준비 중'}
            </strong>
          </div>
          <p className="muted text-small">
            오프라인에서는 앱 화면만 열 수 있습니다. 영수증·근무표 업로드와 수정·확정은 인터넷 연결
            후 다시 시도해 주세요.
          </p>
          <div className="settings-row">
            <span>연결 방식</span>
            <strong>{isDemo ? '브라우저 로컬 데모' : '실제 서버 API'}</strong>
          </div>
          <div className="settings-row">
            <span>자동 승인</span>
            <strong>
              <Check size={14} />
              사용하지 않음
            </strong>
          </div>
          <p className="muted text-small">
            {isDemo
              ? '데모 데이터와 업로드 파일은 이 브라우저에 저장됩니다. 브라우저 데이터를 지우면 삭제됩니다. 실제 서비스 로그인과 팀원 공유는 백엔드 연결이 필요합니다.'
              : '사업장 접근 권한과 원본 보호는 연결된 서버에서 검증해야 합니다.'}
          </p>
          {logout.error && <ErrorState error={logout.error} />}
          {isDemo ? (
            <Link className="btn full" to="/login" onClick={() => setSettings(false)}>
              로그인 안내 화면
            </Link>
          ) : (
            <button
              className="btn full"
              disabled={logout.isPending || !navigator.onLine}
              onClick={() => logout.mutate()}
            >
              {logout.isPending ? '로그아웃 중…' : '로그아웃'}
            </button>
          )}
        </Modal>
      )}
    </div>
  );
}
