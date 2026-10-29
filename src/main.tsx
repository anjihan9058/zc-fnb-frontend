import React, { Component, lazy, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Route,
  RouterProvider,
} from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './app/Layout';
import { WorkspaceProvider } from './app/WorkspaceProvider';
import { SessionGate } from './app/SessionGate';
const MenusPage = lazy(() => import('./pages/MenusPage').then((m) => ({ default: m.MenusPage })));
const ReceivingPage = lazy(() =>
  import('./pages/ReceivingPage').then((m) => ({ default: m.ReceivingPage })),
);
const MorePage = lazy(() => import('./pages/MorePage').then((m) => ({ default: m.MorePage })));
const AccountingPage = lazy(() =>
  import('./pages/FinanceWorkspace').then((m) => ({ default: m.AccountingPage })),
);
const FinancialDashboardPage = lazy(() =>
  import('./pages/FinanceWorkspace').then((m) => ({ default: m.FinancialDashboardPage })),
);
const ReportsPage = lazy(() =>
  import('./pages/FinanceWorkspace').then((m) => ({ default: m.ReportsPage })),
);
const BankingPage = lazy(() =>
  import('./pages/BankingPage').then((m) => ({ default: m.BankingPage })),
);
const SchedulesPage = lazy(() =>
  import('./pages/SchedulesPage').then((m) => ({ default: m.SchedulesPage })),
);
const ScheduleReviewPage = lazy(() =>
  import('./pages/SchedulesPage').then((m) => ({ default: m.ScheduleReviewPage })),
);
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const ChatPage = lazy(() => import('./pages/ChatPage').then((m) => ({ default: m.ChatPage })));
const ReceiptReviewPage = lazy(() =>
  import('./pages/ReceiptPage').then((m) => ({ default: m.ReceiptReviewPage })),
);
const ReceiptsPage = lazy(() =>
  import('./pages/ReceiptPage').then((m) => ({ default: m.ReceiptsPage })),
);
const PricesPage = lazy(() =>
  import('./pages/PricesPage').then((m) => ({ default: m.PricesPage })),
);
const WastePage = lazy(() => import('./pages/WastePage').then((m) => ({ default: m.WastePage })));
const ProductsPage = lazy(() =>
  import('./pages/ProductsPage').then((m) => ({ default: m.ProductsPage })),
);
import { ToastProvider } from './shared/ui';
import './theme.css';
import './styles.css';
const client = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 15000, refetchOnWindowFocus: true, networkMode: 'always' },
    mutations: { retry: false, networkMode: 'always' },
  },
});
class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="empty">
        <h1>화면을 불러오지 못했습니다</h1>
        <p>브라우저 저장소와 연결 상태를 확인한 뒤 다시 시도해 주세요.</p>
        <button className="btn primary" onClick={() => location.reload()}>
          다시 불러오기
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
const router = createBrowserRouter(
  createRoutesFromElements(
    <Route
      element={
        <SessionGate>
          <WorkspaceProvider>
            <Layout />
          </WorkspaceProvider>
        </SessionGate>
      }
    >
      <Route index element={<Navigate replace to="/dashboard" />} />
      <Route path="dashboard" element={<DashboardPage />} />
      <Route path="dashboard/financial" element={<FinancialDashboardPage />} />
      <Route path="accounting" element={<AccountingPage />} />
      <Route path="banking" element={<BankingPage />} />
      <Route path="reports" element={<ReportsPage />} />
      <Route path="rooms/:roomId" element={<ChatPage />} />
      <Route path="receipts" element={<ReceiptsPage />} />
      <Route path="receipts/:receiptId" element={<ReceiptReviewPage />} />
      <Route path="prices" element={<PricesPage />} />
      <Route path="products" element={<ProductsPage />} />
      <Route path="menus" element={<MenusPage />} />
      <Route path="receiving" element={<ReceivingPage />} />
      <Route path="waste" element={<WastePage />} />
      <Route path="more" element={<MorePage />} />
      <Route path="schedules" element={<SchedulesPage />} />
      <Route path="schedules/:scheduleId" element={<ScheduleReviewPage />} />
      <Route
        path="*"
        element={
          <div className="empty">
            <h1>페이지를 찾을 수 없습니다</h1>
            <a href="/dashboard" className="btn">
              대시보드로 이동
            </a>
          </div>
        }
      />
    </Route>,
  ),
);
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
