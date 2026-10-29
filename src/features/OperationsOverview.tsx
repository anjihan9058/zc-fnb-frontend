import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  PackageCheck,
  Plus,
  ReceiptText,
} from 'lucide-react';
import { usePrices, useReceiving, useSummary } from '../app/hooks';
import { useWorkspace } from '../app/WorkspaceProvider';
import { workspaceShortcuts } from '../app/workspaceNavigation';
import { scheduleApi } from '../shared/api';
import { dateLabel, today, won } from '../shared/format';
import { shiftTime } from '../shared/schedules';
import { Badge, Empty, ErrorState, Loading } from '../shared/ui';
import { DashboardSelector } from '../pages/FinanceWorkspace';
import { UploadDialog } from './UploadDialog';
import { ScheduleTextDialog } from './ScheduleTextDialog';
import { CostAccountingOverview } from './CostAccountingOverview';

export function OperationsOverview() {
  const navigate = useNavigate();
  const workspace = useWorkspace(),
    summary = useSummary(),
    prices = usePrices(),
    receiving = useReceiving();
  const schedules = useQuery({
    queryKey: ['work-schedules'],
    queryFn: scheduleApi.list,
    refetchInterval: 10000,
  });
  const shifts = useQuery({ queryKey: ['shifts'], queryFn: scheduleApi.shifts });
  const employees = useQuery({ queryKey: ['employees'], queryFn: scheduleApi.employees });
  const [date, setDate] = useState(today()),
    [activity, setActivity] = useState('documents'),
    [upload, setUpload] = useState(false),
    [scheduleOpen, setScheduleOpen] = useState(false);
  const all = summary.data?.recent ?? [],
    pending = all.filter((r) => ['NEEDS_REVIEW', 'READY_TO_APPROVE'].includes(r.status)),
    pendingSchedules = schedules.data?.filter((d) => d.status === 'NEEDS_REVIEW'),
    pendingReceiving = receiving.data?.filter((d) => !d.completed);
  const start = shiftTime(`${date}T00:00`),
    end = start + 86400000;
  const dayShifts = (shifts.data ?? [])
    .filter((row) => shiftTime(row.starts_at) < end && shiftTime(row.ends_at) > start)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const daily = prices.data?.filter((p) => p.purchased_at === date),
    monthly = prices.data?.filter(
      (p) => p.purchased_at >= `${date.slice(0, 7)}-01` && p.purchased_at <= date,
    );
  const topIngredients = [...new Set(monthly?.map((p) => `${p.product_id}:${p.unit}`) ?? [])]
    .map((key) => {
      const rows = monthly!.filter((p) => `${p.product_id}:${p.unit}` === key);
      return {
        key,
        name: rows[0].name,
        unit: rows[0].unit,
        total: rows.reduce((n, p) => n + p.quantity * p.unit_price, 0),
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  const max = Math.max(1, ...topIngredients.map((p) => p.total));
  const activityTabs = [
    ['documents', '문서', summary.data ? pending.length : undefined],
    ['schedules', '근무표', pendingSchedules?.length],
    ['receiving', '입고', pendingReceiving?.length],
  ] as const;
  return (
    <div className="page operations-overview">
      <header className="overview-header">
        <div className="overview-title">
          <span className="overview-store">{workspace.name}</span>
          <h1>{dateLabel(date)} 운영 현황</h1>
        </div>
        <div className="overview-controls">
          <DashboardSelector value="operations" />
          <label className="overview-date">
            <CalendarDays size={16} />
            <input
              type="date"
              value={date}
              aria-label="운영 현황 날짜"
              onChange={(e) => setDate(e.target.value || today())}
            />
          </label>
        </div>
      </header>
      <section className="operation-shortcuts" aria-label="업무 바로가기">
        {workspaceShortcuts(workspace.room_id).map(({ name, to, icon: Icon, action }) => {
          const count =
            to === '/receipts'
              ? pending.length
              : to === '/schedules'
                ? pendingSchedules?.length
                : to === '/receiving'
                  ? pendingReceiving?.length
                  : undefined;
          return (
            <article key={name}>
              <Link to={to}>
                <span className="shortcut-icon">
                  <Icon size={24} />
                </span>
                <strong>{name}</strong>
              </Link>
              {!!count && (
                <Link
                  to={
                    to === '/receipts'
                      ? '/receipts?status=REVIEW'
                      : to === '/schedules'
                        ? '/schedules?status=NEEDS_REVIEW'
                        : '/receiving?status=OPEN'
                  }
                  className="shortcut-count"
                  aria-label={`${name} 확인할 항목 ${count}건`}
                >
                  {count}
                </Link>
              )}
              {action && (
                <button
                  className="shortcut-create"
                  aria-label={`${name} 추가`}
                  onClick={() =>
                    action === 'receipt'
                      ? setUpload(true)
                      : action === 'waste'
                        ? navigate('/waste?new=1')
                        : setScheduleOpen(true)
                  }
                >
                  <Plus size={15} />
                </button>
              )}
            </article>
          );
        })}
      </section>
      <CostAccountingOverview date={date} />
      <div className="overview-grid">
        <section className="panel overview-purchases">
          <div className="panel-heading">
            <div>
              <h2>식재료 구매 구성</h2>
              <p>이번 달 확정 구매금액 상위 5개 · 실제 사용 원가와 별도</p>
            </div>
            <Link className="text-link" to="/menus">
              메뉴 원가
              <ArrowRight size={14} />
            </Link>
          </div>
          {prices.isPending ? (
            <Loading />
          ) : prices.error ? (
            <ErrorState error={prices.error} retry={() => prices.refetch()} />
          ) : !topIngredients.length ? (
            <Empty title="이 기간에 확정된 구매 기록이 없습니다" />
          ) : (
            <ol className="ingredient-spend-bars">
              {topIngredients.map((item) => (
                <li key={item.key}>
                  <span>
                    {item.name}
                    <small>{item.unit}</small>
                  </span>
                  <div>
                    <i style={{ width: `${(item.total / max) * 100}%` }} />
                  </div>
                  <b>{won(item.total)}</b>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="panel overview-daily">
          <div className="panel-heading">
            <div>
              <h2>구매 · 근무 요약</h2>
              <p>{dateLabel(date)} · 확정된 기록 기준</p>
            </div>
          </div>
          <dl className="daily-stat-list">
            <div>
              <dt>당일 확정 구매</dt>
              <dd>{daily ? won(daily.reduce((n, p) => n + p.quantity * p.unit_price, 0)) : '—'}</dd>
            </div>
            <div>
              <dt>
                확인할 문서<small>전체 기간</small>
              </dt>
              <dd>
                {summary.data ? (
                  <Link to="/receipts?status=REVIEW">
                    {pending.length}건
                    <ChevronRight size={15} />
                  </Link>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt>당일 근무 인원</dt>
              <dd>
                {shifts.data
                  ? `${new Set(dayShifts.map((row) => row.employee_id ?? row.raw_employee_name)).size}명`
                  : '—'}
              </dd>
            </div>
          </dl>
          <div className="overview-daily-footer">
            <Link className="text-link" to="/reports">
              구매 내역 보고서
              <ArrowRight size={14} />
            </Link>
          </div>
          {(summary.error || prices.error || shifts.error) && (
            <ErrorState
              error={summary.error || prices.error || shifts.error}
              retry={() => {
                summary.refetch();
                prices.refetch();
                shifts.refetch();
              }}
            />
          )}
        </section>
      </div>
      <div className="overview-grid overview-work-grid">
        <section className="panel overview-activity">
          <div className="panel-heading">
            <h2>처리할 업무</h2>
          </div>
          <div className="workspace-view-tabs">
            {activityTabs.map(([key, label, count]) => (
              <button
                key={key}
                aria-pressed={activity === key}
                className={activity === key ? 'active' : ''}
                onClick={() => setActivity(key)}
              >
                {label}
                {count != null && <span>{count}</span>}
              </button>
            ))}
          </div>
          {activity === 'documents' ? (
            summary.isPending ? (
              <Loading />
            ) : summary.error ? (
              <ErrorState error={summary.error} retry={() => summary.refetch()} />
            ) : pending.length ? (
              <div className="overview-activity-list">
                {pending.slice(0, 5).map((r) => (
                  <Link key={r.receipt_id} to={`/receipts/${r.receipt_id}`}>
                    <span className="activity-icon">
                      <ReceiptText size={17} />
                    </span>
                    <div>
                      <strong>{r.supplier.name || r.file_name}</strong>
                      <small>{r.purchased_at || '날짜 미확인'}</small>
                    </div>
                    <Badge status={r.status} />
                    <ChevronRight size={16} />
                  </Link>
                ))}
              </div>
            ) : (
              <Empty title="대기 중인 문서가 없습니다">
                <p>새 영수증을 올리면 여기에서 확인할 수 있습니다.</p>
              </Empty>
            )
          ) : activity === 'schedules' ? (
            schedules.isPending ? (
              <Loading />
            ) : schedules.error ? (
              <ErrorState error={schedules.error} retry={() => schedules.refetch()} />
            ) : pendingSchedules?.length ? (
              <div className="overview-activity-list">
                {pendingSchedules.slice(0, 5).map((d) => (
                  <Link key={d.schedule_id} to={`/schedules/${d.schedule_id}`}>
                    <span className="activity-icon">
                      <CalendarDays size={17} />
                    </span>
                    <div>
                      <strong>{d.file_name}</strong>
                      <small>{d.shifts.length}개 근무 · 확인 필요</small>
                    </div>
                    <ChevronRight size={16} />
                  </Link>
                ))}
              </div>
            ) : (
              <Empty title="확인할 근무표가 없습니다">
                <p>팀채팅에 긴 근무 현황을 올려 정리해 보세요.</p>
              </Empty>
            )
          ) : receiving.isPending ? (
            <Loading />
          ) : receiving.error ? (
            <ErrorState error={receiving.error} retry={() => receiving.refetch()} />
          ) : pendingReceiving?.length ? (
            <div className="overview-activity-list">
              {pendingReceiving.slice(0, 5).map((d) => (
                <Link key={d.receipt_id} to="/receiving?status=OPEN">
                  <span className="activity-icon">
                    <PackageCheck size={17} />
                  </span>
                  <div>
                    <strong>{d.supplier}</strong>
                    <small>{d.lines.length}개 품목 · 수량 확인</small>
                  </div>
                  <ChevronRight size={16} />
                </Link>
              ))}
            </div>
          ) : (
            <Empty title="대기 중인 입고 검수가 없습니다" />
          )}
        </section>
        <section className="panel overview-lineup">
          <div className="panel-heading">
            <div>
              <h2>근무 현황</h2>
              <p>{dateLabel(date)} · 확정된 기록 · 휴게시간 포함 구간</p>
            </div>
            <Link className="text-link" to="/schedules">
              전체 근무표
              <ArrowRight size={14} />
            </Link>
          </div>
          {shifts.isPending || employees.isPending ? (
            <Loading />
          ) : shifts.error || employees.error ? (
            <ErrorState
              error={shifts.error || employees.error}
              retry={() => {
                shifts.refetch();
                employees.refetch();
              }}
            />
          ) : !dayShifts.length ? (
            <Empty title="선택한 날짜에 확정된 근무가 없습니다">
              <p>근무 현황을 정리하고 확정하면 시간대별로 표시됩니다.</p>
            </Empty>
          ) : (
            <div className="lineup-scroll">
              <div className="lineup-chart">
                <div className="lineup-hours">
                  <span />
                  <div>
                    {[0, 6, 12, 18, 24].map((h) => (
                      <small key={h}>{String(h).padStart(2, '0')}:00</small>
                    ))}
                  </div>
                </div>
                {dayShifts.slice(0, 10).map((row, index) => (
                  <div className="lineup-row" key={`${row.schedule_id}-${row.id}`}>
                    <strong>
                      {employees.data?.find((e) => e.id === row.employee_id)?.name ||
                        row.raw_employee_name}
                    </strong>
                    <div className="lineup-track">
                      <Link
                        to={`/schedules/${row.schedule_id}`}
                        title={`${row.starts_at.replace('T', ' ')} ~ ${row.ends_at.replace('T', ' ')}`}
                        style={{
                          left: `${(Math.max(start, shiftTime(row.starts_at)) - start) / 864000}%`,
                          width: `${(Math.min(end, shiftTime(row.ends_at)) - Math.max(start, shiftTime(row.starts_at))) / 864000}%`,
                          background: `var(--series-${(index % 4) + 1})`,
                        }}
                      >
                        {row.starts_at.slice(11)}–{row.ends_at.slice(0, 10) > date ? '익일 ' : ''}
                        {row.ends_at.slice(11)}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
              {dayShifts.length > 10 && (
                <p className="muted text-small">
                  최대 10개 구간 표시 · 전체 기록은 근무표에서 확인하세요.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
      {upload && <UploadDialog room={workspace.room_id} close={() => setUpload(false)} />}
      {scheduleOpen && (
        <ScheduleTextDialog text="" room={workspace.room_id} close={() => setScheduleOpen(false)} />
      )}
    </div>
  );
}
