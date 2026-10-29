import { exportScheduleWorkbook } from '../shared/exportSchedule';
import { useWorkspace } from '../app/WorkspaceProvider';

import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { DayTimeline } from '../features/DayTimeline';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, CalendarDays, Download, Plus } from 'lucide-react';
import { scheduleApi, isDemo } from '../shared/api';
import { scheduleLabels, shiftTime, type WorkSchedule } from '../shared/schedules';
import { today } from '../shared/format';
import { Empty, ErrorState, Loading, ResourceError } from '../shared/ui';
import { useRefresh, useWorkSchedule } from '../app/hooks';
import { ScheduleEditor } from '../features/ScheduleEditor';
import { ScheduleTextDialog } from '../features/ScheduleTextDialog';

function addDays(date: string, n: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + n);
  return value.toISOString().slice(0, 10);
}
function monday(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -(day === 0 ? 6 : day - 1));
}
function ScheduleBadge({ status }: { status: WorkSchedule['status'] }) {
  return (
    <span className={`badge status-${status === 'CONFIRMED' ? 'APPROVED' : status}`}>
      {scheduleLabels[status]}
    </span>
  );
}
export function ScheduleCard({ id }: { id: string }) {
  const query = useWorkSchedule(id);
  if (query.isPending)
    return (
      <div className="receipt-card">
        <Loading />
      </div>
    );
  if (query.error) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  const doc = query.data;
  return (
    <div className="receipt-card">
      <div className="receipt-card-head">
        <span className="mini-icon green">
          <CalendarDays size={20} />
        </span>
        <div>
          <strong>{doc.file_name}</strong>
          <span className="record-kind-label">
            {doc.record_kind === 'WORKED'
              ? '지난 근무 현황'
              : doc.record_kind === 'PLANNED'
                ? '예정 근무표'
                : '용도 미지정'}
          </span>
          <small>근무표{doc.demo ? ' · 데모' : ''}</small>
        </div>
      </div>
      <ScheduleBadge status={doc.status} />
      {!!doc.shifts.length && (
        <div className="receipt-card-stats">
          <span>
            직원{' '}
            <strong>
              {new Set(doc.shifts.map((row) => row.employee_id ?? row.raw_employee_name)).size}명
            </strong>
          </span>
          <span>
            근무 <strong>{doc.shifts.length}건</strong>
          </span>
        </div>
      )}
      <p className="analysis-message">
        {doc.status === 'FAILED'
          ? doc.error || '다시 시도해 주세요.'
          : doc.status === 'CONFIRMED'
            ? `${doc.shifts.length}개 쉬프트가 반영되었습니다.`
            : doc.demo === 'manual'
              ? '원본을 보며 쉬프트를 직접 입력해 주세요.'
              : '직원과 근무 시간을 확인한 뒤 일정으로 확정하세요.'}
      </p>
      <Link className="receipt-card-link" to={`/schedules/${id}`}>
        근무표 확인하기 <ArrowRight size={16} />
      </Link>
    </div>
  );
}

export function SchedulesPage() {
  const workspace = useWorkspace();
  const [textImport, setTextImport] = useState(false);
  const [week, setWeek] = useState(() => monday(today()));
  const [employee, setEmployee] = useState('');
  const [kind, setKind] = useState('ALL');
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'ALL';
  const [day, setDay] = useState(today());
  const [view, setView] = useState<'week' | 'all' | 'day'>('week');
  const docs = useQuery({
    queryKey: ['work-schedules'],
    queryFn: scheduleApi.list,
    refetchInterval: 4000,
  });
  const shifts = useQuery({ queryKey: ['shifts'], queryFn: scheduleApi.shifts });
  const employees = useQuery({ queryKey: ['employees'], queryFn: scheduleApi.employees });
  const confirmedRows = (shifts.data ?? [])
    .map((row) => ({
      ...row,
      record_kind:
        row.record_kind ??
        docs.data?.find((doc) => doc.schedule_id === row.schedule_id)?.record_kind,
    }))
    .filter(
      (row) =>
        kind === 'ALL' || (kind === 'UNSPECIFIED' ? !row.record_kind : row.record_kind === kind),
    );
  const employeeRows = employees.data ?? [];
  const allRows = confirmedRows
    .filter((row) => !employee || row.employee_id === employee)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const days = Array.from({ length: 7 }, (_, n) => addDays(week, n));
  const exportExcel = useMutation({
    mutationFn: async () => {
      if (!employees.data || !shifts.data || !docs.data)
        throw new Error('근무표를 모두 불러온 뒤 내려받아 주세요.');
      await exportScheduleWorkbook(allRows, employees.data, docs.data, workspace.name);
    },
  });
  return (
    <div className="page schedules-page">
      <div className="page-heading">
        <div>
          <h1>근무표 · 쉬프트</h1>
          <p>채팅에 적은 근무 내역을 정리하고 직원별 일정을 확인하세요.</p>
        </div>
        <div className="schedule-page-actions">
          <button className="btn primary" onClick={() => setTextImport(true)}>
            <Plus size={17} />
            근무표 입력
          </button>
        </div>
      </div>
      <section className="panel schedule-section">
        <div className="schedule-toolbar">
          <div>
            <h2>
              {view === 'week' ? '주간 근무표' : view === 'day' ? '일간 근무표' : '전체 근무일정'}
            </h2>
            <p className="muted">확정된 일정만 표시 · 한국 시간 기준</p>
          </div>
          <label className="field">
            근무표 용도
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="ALL">전체</option>
              <option value="WORKED">지난 근무 현황</option>
              <option value="PLANNED">예정 근무표</option>
              <option value="UNSPECIFIED">미지정</option>
            </select>
          </label>
          <label className="field">
            직원
            <select value={employee} onChange={(e) => setEmployee(e.target.value)}>
              <option value="">전체 직원</option>
              {employees.data?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="week-controls">
          <div className="schedule-view-toggle">
            <button
              aria-pressed={view === 'week'}
              className={view === 'week' ? 'active' : ''}
              onClick={() => setView('week')}
            >
              주간
            </button>
            <button
              aria-pressed={view === 'all'}
              className={view === 'all' ? 'active' : ''}
              onClick={() => setView('all')}
            >
              전체
            </button>
            <button
              aria-pressed={view === 'day'}
              className={view === 'day' ? 'active' : ''}
              onClick={() => setView('day')}
            >
              일간
            </button>
          </div>
          {view === 'day' && (
            <label className="inline-select">
              날짜
              <input type="date" value={day} onChange={(e) => setDay(e.target.value || today())} />
            </label>
          )}
          {view === 'week' && (
            <>
              <button
                className="btn small"
                aria-label="이전 주"
                onClick={() => setWeek(addDays(week, -7))}
              >
                <ArrowLeft size={16} />
              </button>
              <strong>
                {week} ~ {days[6]}
              </strong>
              <button
                className="btn small"
                aria-label="다음 주"
                onClick={() => setWeek(addDays(week, 7))}
              >
                <ArrowRight size={16} />
              </button>
              <button className="text-link" onClick={() => setWeek(monday(today()))}>
                이번 주
              </button>
            </>
          )}
          <span className="muted text-small">
            {view === 'all' ? `전체 ${allRows.length}건` : ''}
          </span>
          <button
            className="btn small"
            disabled={
              !allRows.length || shifts.isPending || docs.isPending || exportExcel.isPending
            }
            onClick={() => exportExcel.mutate()}
          >
            <Download size={15} />
            {exportExcel.isPending ? '만드는 중…' : '전체 기간 엑셀'}
          </button>
        </div>
        {exportExcel.error && <ErrorState error={exportExcel.error} />}
        {(shifts.isPending || employees.isPending) && <Loading />}
        {shifts.error && <ErrorState error={shifts.error} retry={() => shifts.refetch()} />}
        {employees.error && (
          <ErrorState error={employees.error} retry={() => employees.refetch()} />
        )}
        {shifts.data && employees.data && view === 'week' && (
          <div className="week-grid">
            {days.map((day, n) => {
              const rows = confirmedRows.filter(
                (s) =>
                  (!employee || s.employee_id === employee) &&
                  shiftTime(s.starts_at) < shiftTime(`${addDays(day, 1)}T00:00`) &&
                  shiftTime(s.ends_at) > shiftTime(`${day}T00:00`),
              );
              return (
                <section className={`week-day ${day === today() ? 'today' : ''}`} key={day}>
                  <h3>
                    <span>{['월', '화', '수', '목', '금', '토', '일'][n]}</span>
                    {day.slice(5).replace('-', '/')}
                  </h3>
                  {rows
                    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
                    .map((row) => (
                      <Link
                        key={`${row.schedule_id}-${row.id}`}
                        to={`/schedules/${row.schedule_id}`}
                        className="shift-chip"
                      >
                        <strong>
                          {employeeRows.find((e) => e.id === row.employee_id)?.name ??
                            row.raw_employee_name}
                        </strong>
                        <span>
                          {row.starts_at.slice(0, 10) < day ? '전날부터' : row.starts_at.slice(11)}{' '}
                          ~ {row.ends_at.slice(0, 10) > day ? '다음 날까지' : row.ends_at.slice(11)}
                        </span>
                        <small>휴게 {row.break_minutes}분</small>
                      </Link>
                    ))}
                  {!rows.length && <span className="muted text-small">일정 없음</span>}
                </section>
              );
            })}
          </div>
        )}
        {shifts.data && employees.data && view === 'day' && (
          <DayTimeline date={day} rows={allRows} employees={employees.data} />
        )}
        {shifts.data &&
          employees.data &&
          view === 'all' &&
          (!allRows.length ? (
            <Empty title="확정된 근무일정이 없습니다">
              <p>근무표를 확인한 뒤 쉬프트를 확정하면 여기에 표시됩니다.</p>
            </Empty>
          ) : (
            <div className="schedule-list all-shifts">
              {allRows.map((row) => (
                <Link key={`${row.schedule_id}-${row.id}`} to={`/schedules/${row.schedule_id}`}>
                  <CalendarDays size={21} />
                  <div>
                    <strong>
                      {employeeRows.find((item) => item.id === row.employee_id)?.name ??
                        row.raw_employee_name}
                    </strong>
                    <small>
                      {row.starts_at.replace('T', ' ')} ~ {row.ends_at.replace('T', ' ')} · 휴게{' '}
                      {row.break_minutes}분
                    </small>
                  </div>
                  <ArrowRight size={16} />
                </Link>
              ))}
            </div>
          ))}
      </section>
      <section className="panel schedule-section">
        <div className="schedule-toolbar">
          <h2>올린 근무표</h2>
          <label className="inline-select">
            상태
            <select
              value={status}
              onChange={(e) => setParams({ status: e.target.value }, { replace: true })}
            >
              <option value="ALL">전체</option>
              <option value="NEEDS_REVIEW">확인 필요</option>
              <option value="CONFIRMED">확정</option>
              <option value="FAILED">실패</option>
            </select>
          </label>
        </div>
        {docs.isPending && <Loading />}
        {docs.error && <ErrorState error={docs.error} retry={() => docs.refetch()} />}
        {docs.data?.length === 0 && (
          <Empty title="아직 올린 근무표가 없습니다">
            <p>직원별 근무 내역을 붙여넣어 근무표로 정리해 보세요.</p>
          </Empty>
        )}
        {!!docs.data?.length &&
          !docs.data.some((doc) => status === 'ALL' || doc.status === status) && (
            <Empty title="이 상태의 근무표가 없습니다">
              <p>다른 상태를 선택해 주세요.</p>
            </Empty>
          )}
        <div className="schedule-list">
          {docs.data
            ?.filter((doc) => status === 'ALL' || doc.status === status)
            .map((doc) => (
              <Link key={doc.schedule_id} to={`/schedules/${doc.schedule_id}`}>
                <CalendarDays size={22} />
                <div>
                  <strong>{doc.file_name}</strong>
                  <small>
                    {doc.created_at
                      ? new Date(doc.created_at).toLocaleDateString('ko-KR', {
                          timeZone: 'Asia/Seoul',
                        })
                      : ''}{' '}
                    · {doc.shifts.length}개 쉬프트
                  </small>
                </div>
                <ScheduleBadge status={doc.status} />
                <ArrowRight size={16} />
              </Link>
            ))}
        </div>
      </section>

      {textImport && (
        <ScheduleTextDialog text="" room={workspace.room_id} close={() => setTextImport(false)} />
      )}
    </div>
  );
}

export function ScheduleReviewPage() {
  const { scheduleId = '' } = useParams();
  const query = useWorkSchedule(scheduleId);
  const employees = useQuery({ queryKey: ['employees'], queryFn: scheduleApi.employees });
  const shifts = useQuery({ queryKey: ['shifts'], queryFn: scheduleApi.shifts });
  const refresh = useRefresh();
  const retry = useMutation({
    mutationFn: () => scheduleApi.retry(scheduleId),
    onSuccess: refresh,
  });
  if (query.isPending) return <Loading />;
  if (!query.data)
    return (
      <ResourceError
        error={query.error ?? new Error('근무표를 불러오지 못했습니다.')}
        retry={() => query.refetch()}
        to="/schedules"
        label="근무표 목록으로 돌아가기"
      />
    );
  const doc = query.data;
  const waiting = ['UPLOADED', 'PROCESSING'].includes(doc.status);
  return (
    <div className="page schedules-page">
      <Link to="/schedules" className="text-link">
        <ArrowLeft size={16} />
        근무표 목록
      </Link>
      <div className="page-heading">
        <div>
          <h1>쉬프트 확인</h1>
          <p>
            {doc.file_name} ·{' '}
            {doc.record_kind === 'WORKED'
              ? '지난 근무 현황'
              : doc.record_kind === 'PLANNED'
                ? '예정 근무표'
                : '용도 미지정'}
          </p>
        </div>
        <ScheduleBadge status={doc.status} />
      </div>
      {doc.source_message_id && (
        <Link
          className="text-link"
          to={`/rooms/${encodeURIComponent(doc.room_id)}?message=${encodeURIComponent(doc.source_message_id)}`}
        >
          원문 채팅으로 이동
          <ArrowRight size={15} />
        </Link>
      )}
      {waiting && (
        <div className="panel schedule-section" role="status">
          <Loading />
          <p>
            {doc.demo === 'manual'
              ? '직접 입력할 근무표를 준비하고 있습니다.'
              : '직원과 근무 시간을 분석하고 있습니다.'}
          </p>
        </div>
      )}
      {doc.status === 'FAILED' && (
        <div className="panel schedule-section">
          <ErrorState error={new Error(doc.error || '근무표 분석에 실패했습니다.')} />
          <button
            className="btn"
            disabled={retry.isPending || !navigator.onLine}
            onClick={() => retry.mutate()}
          >
            분석 다시 시도
          </button>
          {retry.error && <ErrorState error={retry.error} />}
        </div>
      )}
      {!waiting && doc.status !== 'FAILED' && (
        <>
          {(employees.isPending || shifts.isPending) && <Loading />}
          {employees.error && (
            <ErrorState error={employees.error} retry={() => employees.refetch()} />
          )}
          {shifts.error && <ErrorState error={shifts.error} retry={() => shifts.refetch()} />}
          {employees.data && shifts.data && (
            <ScheduleEditor
              key={doc.schedule_id}
              document={doc}
              employees={employees.data}
              existing={shifts.data}
            />
          )}
        </>
      )}
    </div>
  );
}
