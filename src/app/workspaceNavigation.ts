import {
  BarChart3,
  Boxes,
  Calculator,
  CalendarDays,
  ChefHat,
  FileBarChart,
  Home,
  MessagesSquare,
  PackageCheck,
  ReceiptText,
  Trash2,
} from 'lucide-react';
export const workspaceModules = (room: string) => [
  {
    id: 'home',
    name: '홈',
    icon: Home,
    to: '/dashboard',
    groups: [
      {
        name: '대시보드',
        items: [
          { name: '운영 개요', to: '/dashboard', exact: true },
          { name: '재무 현황', to: '/dashboard/financial', exact: true },
        ],
      },
    ],
  },
  {
    id: 'reports',
    name: '보고서',
    icon: FileBarChart,
    to: '/reports',
    groups: [
      {
        name: '보고서',
        items: [
          { name: '원가 · 구매 보고서', to: '/reports', exact: true },
          { name: '메뉴 · 원가', to: '/menus', exact: true },
        ],
      },
    ],
  },
  {
    id: 'accounting',
    name: '회계',
    icon: Calculator,
    to: '/accounting',
    groups: [
      {
        name: '매입 관리',
        items: [
          { name: '매입 업무 센터', to: '/accounting', exact: true },
          { name: '문서 처리함', to: '/receipts', exact: false },
        ],
      },
      { name: '은행', items: [{ name: '은행 거래', to: '/banking', exact: true }] },
    ],
  },
  {
    id: 'inventory',
    name: '재고·원가',
    icon: Boxes,
    to: '/menus',
    groups: [
      {
        name: '원가 관리',
        items: [
          { name: '메뉴 · 레시피', to: '/menus', exact: true },
          { name: '식재료 가격', to: '/prices', exact: true },
          { name: '식재료 관리', to: '/products', exact: true },
        ],
      },
      {
        name: '입고 · 폐기',
        items: [
          { name: '입고 검수', to: '/receiving', exact: true },
          { name: '폐기 기록', to: '/waste', exact: true },
        ],
      },
    ],
  },
  {
    id: 'workforce',
    name: '근무',
    icon: CalendarDays,
    to: '/schedules',
    groups: [
      { name: '직원 · 근무', items: [{ name: '근무표 · 현황', to: '/schedules', exact: false }] },
    ],
  },
  {
    id: 'chat',
    name: '팀채팅',
    icon: MessagesSquare,
    to: `/rooms/${encodeURIComponent(room)}`,
    groups: [
      {
        name: '팀 커뮤니케이션',
        items: [{ name: '우리 팀 채팅', to: `/rooms/${encodeURIComponent(room)}`, exact: false }],
      },
    ],
  },
];
export function workspaceModuleId(path: string) {
  if (path.startsWith('/rooms/')) return 'chat';
  if (path.startsWith('/dashboard') || path === '/more') return 'home';
  if (path.startsWith('/reports')) return 'reports';
  if (['/accounting', '/banking', '/receipts'].some((p) => path.startsWith(p))) return 'accounting';
  if (path.startsWith('/schedules')) return 'workforce';
  return 'inventory';
}
export const workspaceShortcuts = (room: string) => [
  { name: '영수증 · 문서', to: '/receipts', icon: ReceiptText, action: 'receipt' },
  { name: '근무표', to: '/schedules', icon: CalendarDays, action: 'schedule' },
  { name: '식재료', to: '/products', icon: Boxes },
  { name: '입고 검수', to: '/receiving', icon: PackageCheck },
  { name: '폐기 기록', to: '/waste', icon: Trash2, action: 'waste' },
  { name: '메뉴 · 레시피', to: '/menus', icon: ChefHat },
  { name: '원가 보고서', to: '/reports', icon: BarChart3 },
  { name: '우리 팀 채팅', to: `/rooms/${encodeURIComponent(room)}`, icon: MessagesSquare },
];
