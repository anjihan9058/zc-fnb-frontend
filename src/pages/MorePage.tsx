import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Calculator,
  CalendarDays,
  Carrot,
  ChartNoAxesCombined,
  ChefHat,
  FileBarChart,
  Landmark,
  LayoutDashboard,
  MessagesSquare,
  PackageCheck,
  ReceiptText,
  Trash2,
} from 'lucide-react';
import { useWorkspace } from '../app/WorkspaceProvider';
export function MorePage() {
  const workspace = useWorkspace();
  const links = [
    {
      to: `/rooms/${encodeURIComponent(workspace.room_id)}`,
      icon: MessagesSquare,
      title: '우리 팀 채팅',
      description: '팀 대화와 영수증·사진·파일 첨부',
    },
    {
      to: '/receipts',
      icon: ReceiptText,
      title: '문서 · 구매',
      description: '원본 비교·수정·가격 승인',
    },
    {
      to: '/menus',
      icon: ChefHat,
      title: '메뉴 · 원가',
      description: '사용량·판매가격과 원가율·예상 마진율',
    },
    {
      to: '/prices',
      icon: ChartNoAxesCombined,
      title: '식재료 가격',
      description: '확정 구매단가와 가격 변동 이력',
    },
    {
      to: '/products',
      icon: Carrot,
      title: '식재료 관리',
      description: '품목·규격과 영수증 이름 연결',
    },
    {
      to: '/receiving',
      icon: PackageCheck,
      title: '입고 검수',
      description: '실제 수량 확인과 누락·오배송 기록',
    },
    {
      to: '/waste',
      icon: Trash2,
      title: '폐기 기록',
      description: '버린 식재료·사유와 추정 손실',
    },
    {
      to: '/schedules',
      icon: CalendarDays,
      title: '근무표 · 쉬프트',
      description: '직원별 근무 일정과 엑셀 출력',
    },
    {
      to: '/dashboard/financial',
      icon: LayoutDashboard,
      title: '재무 현황',
      description: '확정 구매와 재무 자료 연결 상태',
    },
    {
      to: '/accounting',
      icon: Calculator,
      title: '매입 업무 센터',
      description: '문서·구매 검토와 상세 패널',
    },
    {
      to: '/banking',
      icon: Landmark,
      title: '은행 거래',
      description: '계좌 연결 상태·샘플 거래 매칭',
    },
    {
      to: '/reports',
      icon: FileBarChart,
      title: '보고서',
      description: '구매·원가 분석과 손익 화면 구조',
    },
  ];
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>전체 메뉴</h1>
          <p>{workspace.name}의 업무를 한곳에서 관리하세요.</p>
        </div>
      </div>
      <section className="panel more-menu-list">
        {links.map(({ to, icon: Icon, title, description }) => (
          <Link key={to} to={to}>
            <span className="mini-icon green">
              <Icon size={22} />
            </span>
            <span>
              <strong>{title}</strong>
              <small>{description}</small>
            </span>
            <ArrowRight size={18} />
          </Link>
        ))}
      </section>
    </div>
  );
}
