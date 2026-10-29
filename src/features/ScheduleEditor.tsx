import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  FileText,
  Pencil,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { scheduleApi } from '../shared/api';
import {
  analyzeShifts,
  shiftTime,
  type ConfirmedShift,
  type Employee,
  type ShiftDraft,
  type WorkSchedule,
} from '../shared/schedules';
import { createId } from '../shared/id';
import { ErrorState, Modal, useToast } from '../shared/ui';
import { useRefresh } from '../app/hooks';

const hours = (minutes: number | null) =>
  minutes == null ? '확인 필요' : `${Number((minutes / 60).toFixed(2))}시간`;
const elapsed = (row: ShiftDraft) => {
  const value = (shiftTime(row.ends_at) - shiftTime(row.starts_at)) / 60000;
  return Number.isFinite(value) && value > 0 ? value : null;
};
const netMinutes = (row: ShiftDraft) => {
  const duration = elapsed(row);
  return duration != null &&
    row.break_minutes != null &&
    Number.isInteger(row.break_minutes) &&
    row.break_minutes >= 0 &&
    row.break_minutes < duration
    ? duration - row.break_minutes
    : null;
};
// Group by the linked employee first so an OCR-style raw name such as "이서?"
// is shown under the person it was connected to.
const staffKey = (row: ShiftDraft) =>
  row.employee_id ? `employee:${row.employee_id}` : `raw:${row.raw_employee_name}`;
const staffName = (row: ShiftDraft, employees: Employee[]) =>
  employees.find((employee) => employee.id === row.employee_id)?.name ||
  row.raw_employee_name ||
  '직원 미연결';
const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const dayLabel = (value: string) => {
  const day = value.slice(0, 10);
  const date = new Date(`${day}T12:00:00+09:00`);
  return Number.isNaN(date.getTime())
    ? '날짜 확인'
    : `${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일 (${weekdays[date.getUTCDay()]})`;
};
const reportedMismatch = (row: ShiftDraft) =>
  row.reported_hours != null &&
  elapsed(row) != null &&
  Math.abs(row.reported_hours * 60 - elapsed(row)!) > 0.01 &&
  (netMinutes(row) == null || Math.abs(row.reported_hours * 60 - netMinutes(row)!) > 0.01);
const sourceWarnings = (row: ShiftDraft) =>
  row.warnings.filter(
    (warning) =>
      !warning.startsWith('휴게 시간이 원문에 없어') &&
      !/^원문 .*시간과 출퇴근/.test(warning) &&
      (!warning.startsWith('시작·종료 시각이 같아') || (elapsed(row) ?? 0) >= 1440),
  );
type Filter = 'all' | 'problems' | 'breaks' | 'unreviewed';

export function ScheduleEditor({
  document: serverDoc,
  employees,
  existing,
}: {
  document: WorkSchedule;
  employees: Employee[];
  existing: ConfirmedShift[];
}) {
  const client = useQueryClient();
  const refresh = useRefresh();
  const toast = useToast();
  const [doc, setDoc] = useState(serverDoc);
  const [rows, setRows] = useState<ShiftDraft[]>(() => structuredClone(serverDoc.shifts));
  const [filter, setFilter] = useState<Filter>('all');
  const [staff, setStaff] = useState('');
  const [editing, setEditing] = useState<ShiftDraft | null>(null);
  const [breakValue, setBreakValue] = useState('');
  const [breakScope, setBreakScope] = useState<'missing' | 'staff' | 'all'>('missing');
  const [breakError, setBreakError] = useState<Error | null>(null);
  const [newEmployee, setNewEmployee] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const breakInput = useRef<HTMLInputElement>(null);
  const keys = useRef(new Map<number, string>());
  const dirty = JSON.stringify(rows) !== JSON.stringify(doc.shifts);
  const confirmed = doc.status === 'CONFIRMED';
  const remoteChanged = serverDoc.version > doc.version;
  const issues = useMemo(
    () =>
      analyzeShifts(
        rows,
        employees,
        existing.filter((shift) => shift.schedule_id !== doc.schedule_id),
        doc.record_kind,
      ),
    [rows, employees, existing, doc.schedule_id, doc.record_kind],
  );
  const issueMap = useMemo(
    () =>
      new Map(rows.map((row, index) => [row.id, issues.filter((issue) => issue.index === index)])),
    [rows, issues],
  );
  const hardIssues = issues.filter(
    (issue) => !['UNREVIEWED', 'BREAK_MISSING'].includes(issue.code),
  );
  const missingBreaks = rows.filter((row) => row.break_minutes == null);
  const unreviewed = rows.filter((row) => !row.reviewed);
  const problemRows = rows.filter(
    (row) =>
      issueMap
        .get(row.id)
        ?.some((issue) => !['UNREVIEWED', 'BREAK_MISSING'].includes(issue.code)) ||
      (!row.reviewed &&
        (reportedMismatch(row) || sourceWarnings(row).length > 0 || (elapsed(row) ?? 0) >= 1440)),
  );
  const problemIds = new Set(problemRows.map((row) => row.id));
  const shown = rows.filter(
    (row) =>
      (!staff || staffKey(row) === staff) &&
      (filter === 'all' ||
        (filter === 'problems'
          ? problemIds.has(row.id)
          : filter === 'breaks'
            ? row.break_minutes == null
            : !row.reviewed)),
  );
  const summaries = useMemo(
    () =>
      [...new Set(rows.map(staffKey))].map((key) => {
        const selected = rows.filter((row) => staffKey(row) === key);
        const name = staffName(selected[0], employees);
        const rawNames = new Set(selected.map((row) => row.raw_employee_name).filter(Boolean));
        const total = selected.every((row) => elapsed(row) != null)
          ? selected.reduce((sum, row) => sum + elapsed(row)!, 0)
          : null;
        const net = selected.every((row) => netMinutes(row) != null)
          ? selected.reduce((sum, row) => sum + netMinutes(row)!, 0)
          : null;
        const reportedRows =
          doc.reported_totals?.filter((item) => rawNames.has(item.name) || item.name === name) ??
          [];
        const reported = reportedRows.length
          ? reportedRows.reduce((sum, item) => sum + item.hours, 0)
          : undefined;
        return {
          key,
          name,
          source: [...rawNames].filter((raw) => raw !== name),
          count: selected.length,
          total,
          net,
          reported,
          mismatch:
            reported != null &&
            total != null &&
            Math.abs(reported * 60 - total) > 0.01 &&
            (net == null || Math.abs(reported * 60 - net) > 0.01),
        };
      }),
    [rows, employees, doc.reported_totals],
  );
  const staffLabel = summaries.find((summary) => summary.key === staff)?.name;
  const scope = breakScope === 'staff' && !staff ? 'missing' : breakScope;
  const groups = summaries
    .map((summary) => ({
      ...summary,
      rows: shown
        .filter((row) => staffKey(row) === summary.key)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    }))
    .filter((group) => group.rows.length > 0);
  // Rows that can be ticked in bulk: break set, nothing to fix, not yet reviewed.
  const bulkReady = (list: ShiftDraft[]) =>
    list.filter((row) => !row.reviewed && row.break_minutes != null && !problemIds.has(row.id));
  const shownReady = bulkReady(shown);
  const canReviewAll = rows.length > 0 && hardIssues.length === 0 && missingBreaks.length === 0;

  function adopt(saved: WorkSchedule) {
    client.setQueryData(['work-schedule', saved.schedule_id], saved);
    setDoc(saved);
    setRows(structuredClone(saved.shifts));
  }
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const save = useMutation({
    mutationFn: async () => {
      await scheduleApi.save(doc.schedule_id, rows, doc.version);
      return scheduleApi.get(doc.schedule_id);
    },
    onSuccess: async (saved) => {
      adopt(saved);
      await refresh();
      toast('근무표 초안을 저장했습니다.');
    },
  });
  const confirm = useMutation({
    mutationFn: async () => {
      if (!rows.length || issues.length)
        throw new Error('휴게 설정과 수정할 행을 확인한 뒤 전체 검토를 완료해 주세요.');
      let current = doc;
      if (dirty) {
        await scheduleApi.save(doc.schedule_id, rows, doc.version);
        current = await scheduleApi.get(doc.schedule_id);
        adopt(current);
      }
      if (!keys.current.has(current.version)) keys.current.set(current.version, createId());
      await scheduleApi.confirm(
        current.schedule_id,
        current.version,
        keys.current.get(current.version)!,
      );
      const result = await scheduleApi.get(current.schedule_id);
      if (result.status !== 'CONFIRMED')
        throw new Error('일정 반영이 아직 확인되지 않았습니다. 다시 불러온 후 확인해 주세요.');
      return result;
    },
    onSuccess: async (saved) => {
      adopt(saved);
      await refresh();
      toast('전체 근무표를 확정했습니다.');
    },
  });
  const reload = useMutation({
    mutationFn: () => scheduleApi.get(doc.schedule_id),
    onSuccess: (saved) => {
      adopt(saved);
      save.reset();
      confirm.reset();
    },
  });
  const addEmployee = useMutation({
    mutationFn: () => scheduleApi.addEmployee(newEmployee),
    onSuccess: (employee) => {
      client.setQueryData<Employee[]>(['employees'], (old) => [...(old ?? []), employee]);
      setNewEmployee('');
      toast('직원을 추가했습니다.');
    },
  });
  const busy = save.isPending || confirm.isPending || reload.isPending || addEmployee.isPending;
  const locked = confirmed || busy || remoteChanged;
  function changed(next: ShiftDraft[]) {
    setRows(next);
    save.reset();
    confirm.reset();
  }
  const breakTarget = (row: ShiftDraft) =>
    scope === 'all' || (scope === 'staff' ? staffKey(row) === staff : row.break_minutes == null);
  function applyBreak() {
    const value = Number(breakValue);
    const targets = rows.filter(breakTarget);
    if (breakValue === '' || !Number.isInteger(value) || value < 0) {
      setBreakError(new Error('휴게 시간을 0 이상의 정수로 입력해 주세요.'));
      return;
    }
    if (targets.some((row) => elapsed(row) != null && value >= elapsed(row)!)) {
      setBreakError(
        new Error('근무 길이보다 긴 휴게 시간이 있습니다. 해당 행은 따로 수정해 주세요.'),
      );
      return;
    }
    changed(
      rows.map((row) =>
        breakTarget(row) ? { ...row, break_minutes: value, reviewed: false } : row,
      ),
    );
    setBreakError(null);
    toast(`${targets.length}개 근무에 휴게 ${value}분을 적용했습니다.`);
  }
  function markReviewed(list: ShiftDraft[], reviewed: boolean) {
    const ids = new Set(list.map((row) => row.id));
    changed(rows.map((row) => (ids.has(row.id) ? { ...row, reviewed } : row)));
  }
  function editStaffBreak(key: string) {
    setStaff(key);
    setBreakScope('staff');
    breakInput.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    breakInput.current?.focus({ preventScroll: true });
  }
  function toggleGroup(key: string) {
    setCollapsed((old) => {
      const next = new Set(old);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function updateRow(updated: ShiftDraft) {
    const exists = rows.some((row) => row.id === updated.id);
    changed(
      exists ? rows.map((row) => (row.id === updated.id ? updated : row)) : [...rows, updated],
    );
    setEditing(null);
    if (!exists) {
      setFilter('all');
      setStaff('');
    }
  }
  const statusFor = (row: ShiftDraft) => {
    const relevant =
      issueMap
        .get(row.id)
        ?.filter((issue) => !['UNREVIEWED', 'BREAK_MISSING'].includes(issue.code)) ?? [];
    return (
      relevant[0]?.message ??
      (!row.reviewed && reportedMismatch(row)
        ? '원문 시간 차이'
        : !row.reviewed && sourceWarnings(row).length
          ? '원문 확인 필요'
          : !row.reviewed && (elapsed(row) ?? 0) >= 1440
            ? '24시간 근무 확인'
            : row.break_minutes == null
              ? '휴게 설정 대기'
              : row.reviewed
                ? '확인 완료'
                : '전체 검토 대기')
    );
  };
  return (
    <div className="schedule-overview-editor" data-unsaved={dirty} data-pending={busy}>
      {remoteChanged && (
        <div className="info-box">
          다른 창에서 변경한 내용이 있습니다. 현재 입력을 보관한 뒤 저장 내용을 다시 불러와 주세요.
        </div>
      )}
      <div className="schedule-overview-stats">
        <div>
          <span>전체 근무</span>
          <strong>
            {rows.length}
            <small>건</small>
          </strong>
        </div>
        <div>
          <span>직원</span>
          <strong>
            {summaries.length}
            <small>명</small>
          </strong>
        </div>
        <button
          className={problemRows.length ? 'has-problem' : ''}
          onClick={() => {
            setFilter('problems');
            setStaff('');
          }}
        >
          <span>수정·확인 필요</span>
          <strong>
            {problemRows.length}
            <small>건</small>
          </strong>
        </button>
        <button
          onClick={() => {
            setFilter('breaks');
            setStaff('');
            setBreakScope('missing');
            breakInput.current?.focus();
          }}
        >
          <span>휴게 미정</span>
          <strong>
            {missingBreaks.length}
            <small>건</small>
          </strong>
        </button>
      </div>
      <section className="panel schedule-overview-section">
        <div className="schedule-toolbar">
          <div>
            <h2>직원별 전체 요약</h2>
            <p className="muted">원문 합계와 출퇴근 기준 시간을 먼저 비교하세요.</p>
          </div>
        </div>
        <div className="schedule-staff-summary">
          {summaries.map((summary) => (
            <button
              key={summary.key}
              className={summary.mismatch ? 'has-difference' : ''}
              aria-pressed={staff === summary.key}
              onClick={() => {
                setStaff(staff === summary.key ? '' : summary.key);
                setFilter('all');
              }}
            >
              <strong>
                {summary.name}
                <small>{summary.count}회</small>
              </strong>
              {summary.source.length > 0 && (
                <small className="schedule-staff-source">
                  원문 표기 {summary.source.join(', ')}
                </small>
              )}
              <span>
                출퇴근 <b>{hours(summary.total)}</b>
              </span>
              <span>
                실근무 <b>{hours(summary.net)}</b>
              </span>
              {summary.reported != null && (
                <span>
                  원문 합계 <b>{summary.reported}시간</b>
                </span>
              )}
              {summary.mismatch && (
                <em>
                  <AlertCircle size={13} />
                  원문 합계 차이 확인
                </em>
              )}
            </button>
          ))}
        </div>
      </section>
      <section className="panel schedule-overview-section schedule-review-section">
        <div className="schedule-toolbar">
          <div>
            <h2>정리된 근무표</h2>
            <p className="muted">
              직원별로 묶어 보여줍니다. 휴게 시간과 확인은 한 번에 처리하고, 다른 근무만 따로
              수정하세요.
            </p>
          </div>
          {!confirmed && (
            <button
              className="btn small"
              disabled={locked}
              onClick={() =>
                setEditing({
                  id: createId(),
                  employee_id: null,
                  raw_employee_name: '',
                  starts_at: '',
                  ends_at: '',
                  break_minutes: null,
                  warnings: [],
                  reviewed: false,
                })
              }
            >
              <Plus size={16} />
              근무 추가
            </button>
          )}
        </div>
        {!confirmed && (
          <fieldset className="schedule-bulk" disabled={locked}>
            <legend className="sr-only">일괄 설정</legend>
            <div className="schedule-bulk-row">
              <span className="schedule-bulk-label">휴게 시간 일괄 적용</span>
              <div className="schedule-bulk-controls">
                <label className="schedule-bulk-minutes">
                  <span className="sr-only">휴게 시간 (분)</span>
                  <input
                    ref={breakInput}
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    value={breakValue}
                    onChange={(e) => {
                      setBreakValue(e.target.value);
                      setBreakError(null);
                    }}
                    placeholder="예: 60"
                  />
                  <span aria-hidden="true">분</span>
                </label>
                <label className="schedule-bulk-scope">
                  <span className="sr-only">적용 대상</span>
                  <select
                    value={scope}
                    onChange={(e) => setBreakScope(e.target.value as typeof breakScope)}
                  >
                    <option value="missing">휴게 미정 {missingBreaks.length}건에만</option>
                    {staff && (
                      <option value="staff">
                        {staffLabel} 근무 {rows.filter((row) => staffKey(row) === staff).length}건
                        전체
                      </option>
                    )}
                    <option value="all">전체 {rows.length}건 덮어쓰기</option>
                  </select>
                </label>
                <button
                  className="btn"
                  disabled={!rows.length || breakValue === '' || !rows.some(breakTarget)}
                  onClick={applyBreak}
                >
                  적용
                </button>
              </div>
            </div>
            <div className="schedule-bulk-row">
              <span className="schedule-bulk-label">확인 처리</span>
              <div className="schedule-bulk-controls">
                <button
                  className="btn"
                  disabled={!shownReady.length}
                  onClick={() => markReviewed(shownReady, true)}
                >
                  <CheckCheck size={16} />
                  {shownReady.length
                    ? `보이는 근무 ${shownReady.length}건 모두 확인`
                    : '한 번에 확인할 근무 없음'}
                </button>
                <span className="schedule-bulk-hint">휴게 미정·수정 필요 근무는 빠집니다.</span>
              </div>
            </div>
          </fieldset>
        )}
        {breakError && <ErrorState error={breakError} />}
        <div className="schedule-review-toolbar">
          <div className="schedule-review-tabs" role="group" aria-label="근무표 필터">
            {(
              [
                ['all', '전체', rows.length],
                ['problems', '수정 필요', problemRows.length],
                ['breaks', '휴게 미정', missingBreaks.length],
                ['unreviewed', '미확인', unreviewed.length],
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                aria-pressed={filter === value}
                className={filter === value ? 'active' : ''}
                onClick={() => setFilter(value)}
              >
                {label}
                <span>{count}</span>
              </button>
            ))}
          </div>
          <div className="schedule-review-filters">
            {groups.length > 1 && (
              <button
                className="text-link"
                onClick={() =>
                  setCollapsed(collapsed.size ? new Set() : new Set(groups.map((g) => g.key)))
                }
              >
                {collapsed.size ? '모두 펼치기' : '모두 접기'}
              </button>
            )}
            <label className="field">
              <span className="sr-only">직원 필터</span>
              <select value={staff} onChange={(e) => setStaff(e.target.value)}>
                <option value="">전체 직원</option>
                {summaries.map((summary) => (
                  <option key={summary.key} value={summary.key}>
                    {summary.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {shown.length === 0 ? (
          <div className="schedule-no-problems">
            <Check size={24} />
            <p>
              {filter === 'all' ? '표시할 근무가 없습니다.' : '이 조건에서 확인할 근무가 없습니다.'}
            </p>
            <button
              className="text-link"
              onClick={() => {
                setFilter('all');
                setStaff('');
              }}
            >
              전체 근무표 보기
            </button>
          </div>
        ) : (
          <div className="schedule-review-table-wrap">
            <table className="schedule-review-table">
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>근무 시간</th>
                  <th className="numeric">휴게</th>
                  <th className="numeric">실근무</th>
                  <th>상태</th>
                  <th>확인 · 수정</th>
                </tr>
              </thead>
              {groups.map((group) => {
                const open = !collapsed.has(group.key);
                const ready = bulkReady(group.rows);
                const reviewedAll = group.rows.every((row) => row.reviewed);
                const someReviewed = group.rows.some((row) => row.reviewed);
                const problems = group.rows.filter((row) => problemIds.has(row.id)).length;
                const missing = group.rows.filter((row) => row.break_minutes == null).length;
                return (
                  <tbody
                    key={group.key}
                    className={open ? 'schedule-group' : 'schedule-group closed'}
                  >
                    <tr className="schedule-group-row">
                      <th colSpan={6} scope="rowgroup">
                        <div className="schedule-group-head">
                          <button
                            className="schedule-group-toggle"
                            aria-expanded={open}
                            onClick={() => toggleGroup(group.key)}
                          >
                            <ChevronDown size={16} />
                            <strong>{group.name}</strong>
                            <span>
                              {group.rows.length === group.count
                                ? `${group.count}회`
                                : `${group.rows.length} / ${group.count}회`}
                            </span>
                          </button>
                          <span className="schedule-group-meta">
                            <span>
                              실근무 <b>{group.net == null ? '—' : hours(group.net)}</b>
                            </span>
                            {missing > 0 && <em>휴게 미정 {missing}</em>}
                            {problems > 0 && <em>수정 필요 {problems}</em>}
                          </span>
                          {!confirmed && (
                            <span className="schedule-group-actions">
                              <button
                                className="text-link"
                                disabled={locked}
                                onClick={() => editStaffBreak(group.key)}
                              >
                                휴게 설정
                              </button>
                              <label
                                title={
                                  !reviewedAll && !ready.length
                                    ? '휴게 미정·수정 필요 근무를 먼저 처리해 주세요.'
                                    : undefined
                                }
                              >
                                <input
                                  type="checkbox"
                                  checked={reviewedAll}
                                  ref={(element) => {
                                    if (element)
                                      element.indeterminate = !reviewedAll && someReviewed;
                                  }}
                                  disabled={locked || (!reviewedAll && !ready.length)}
                                  onChange={(e) =>
                                    markReviewed(
                                      e.target.checked ? ready : group.rows,
                                      e.target.checked,
                                    )
                                  }
                                />
                                <span>모두 확인</span>
                              </label>
                            </span>
                          )}
                        </div>
                      </th>
                    </tr>
                    {open &&
                      group.rows.map((row) => {
                        const nextDay = row.starts_at.slice(0, 10) !== row.ends_at.slice(0, 10);
                        const net = netMinutes(row);
                        return (
                          <tr key={row.id} className={problemIds.has(row.id) ? 'row-problem' : ''}>
                            <td>
                              <span className="review-shift-date">
                                {row.starts_at ? dayLabel(row.starts_at) : '날짜 확인'}
                              </span>
                              {row.raw_employee_name && row.raw_employee_name !== group.name && (
                                <small className="review-shift-source">
                                  원문 {row.raw_employee_name}
                                </small>
                              )}
                            </td>
                            <td>
                              <span className="review-shift-time">
                                {row.starts_at.slice(11) || '시작 확인'} ~{' '}
                                {nextDay && <em>다음 날 </em>}
                                {row.ends_at.slice(11) || '종료 확인'}
                              </span>
                            </td>
                            <td className="numeric" data-label="휴게">
                              {row.break_minutes == null ? (
                                <span className="review-missing">미정</span>
                              ) : (
                                `${row.break_minutes}분`
                              )}
                            </td>
                            <td className="numeric" data-label="실근무">
                              {net == null ? <span className="muted">—</span> : hours(net)}
                            </td>
                            <td>
                              <span
                                className={`review-row-status ${problemIds.has(row.id) ? 'problem' : row.reviewed ? 'done' : ''}`}
                              >
                                {row.reviewed && !problemIds.has(row.id) && <Check size={12} />}
                                {statusFor(row)}
                              </span>
                            </td>
                            <td>
                              <div className="review-row-actions">
                                {!confirmed && (
                                  <label>
                                    <input
                                      type="checkbox"
                                      checked={row.reviewed}
                                      disabled={locked}
                                      onChange={(e) => markReviewed([row], e.target.checked)}
                                    />
                                    <span>확인</span>
                                  </label>
                                )}
                                <button
                                  className="btn small"
                                  disabled={busy || remoteChanged}
                                  onClick={() => setEditing(structuredClone(row))}
                                >
                                  <Pencil size={13} />
                                  {confirmed ? '상세' : '수정'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                );
              })}
            </table>
          </div>
        )}
      </section>
      <details className="panel schedule-overview-source">
        <summary>
          <FileText size={17} />
          원문 근무표와 최초 안내 보기<span>펼치기</span>
        </summary>
        {doc.source_text ? (
          <pre className="schedule-text-original">{doc.source_text}</pre>
        ) : doc.image_url ? (
          doc.file_type === 'application/pdf' ? (
            <a href={doc.image_url} target="_blank" rel="noreferrer" className="btn">
              기존 PDF 원본 열기
            </a>
          ) : (
            <img src={doc.image_url} alt="기존 업로드 근무표 원본" />
          )
        ) : (
          <p className="muted">저장된 원문이 없습니다.</p>
        )}
        {doc.source_notes?.map((note) => (
          <p className="schedule-section-note" key={note}>
            {note}
          </p>
        ))}
      </details>
      {!confirmed && (
        <details className="panel schedule-overview-source">
          <summary>
            <Plus size={17} />
            직원 추가<span>필요할 때 펼치기</span>
          </summary>
          <form
            className="add-employee-inline"
            onSubmit={(e) => {
              e.preventDefault();
              if (newEmployee.trim() && !locked) addEmployee.mutate();
            }}
          >
            <label className="field">
              직원 이름
              <input
                value={newEmployee}
                maxLength={60}
                onChange={(e) => setNewEmployee(e.target.value)}
                disabled={locked}
              />
            </label>
            <button className="btn" disabled={locked || !newEmployee.trim() || !navigator.onLine}>
              직원 추가
            </button>
          </form>
          {addEmployee.error && <ErrorState error={addEmployee.error} />}
        </details>
      )}
      {(save.error || confirm.error || reload.error) && (
        <ErrorState error={save.error || confirm.error || reload.error} />
      )}
      <section className="panel schedule-review-completion">
        {confirmed ? (
          <>
            <span className="schedule-ok">
              <CheckCheck size={20} />
              전체 근무표가 확정되었습니다.
            </span>
            <Link className="btn" to="/schedules">
              일정·엑셀 보기
              <ArrowRight size={16} />
            </Link>
          </>
        ) : (
          <>
            <label className="schedule-confirm-all">
              <input
                type="checkbox"
                checked={rows.length > 0 && !unreviewed.length}
                disabled={locked || !canReviewAll}
                onChange={(e) =>
                  changed(rows.map((row) => ({ ...row, reviewed: e.target.checked })))
                }
              />
              <span>
                <strong>정리된 전체 근무표와 원문을 확인했습니다.</strong>
                <small>
                  {hardIssues.length
                    ? `${new Set(hardIssues.map((issue) => issue.id)).size}개 근무의 오류를 먼저 수정하세요.`
                    : missingBreaks.length
                      ? `휴게 미정 ${missingBreaks.length}건을 공통 설정하거나 개별 수정해 주세요.`
                      : '개별 행마다 확인을 누르지 않고 전체를 한 번에 확인할 수 있습니다.'}
                </small>
              </span>
            </label>
            <div className="schedule-completion-actions">
              <button
                className="btn"
                disabled={locked || !dirty || !navigator.onLine}
                onClick={() => save.mutate()}
              >
                <Save size={16} />
                {save.isPending ? '저장 중…' : '초안 저장'}
              </button>
              <button
                className="btn primary"
                disabled={locked || !rows.length || !!issues.length || !navigator.onLine}
                onClick={() => confirm.mutate()}
              >
                <Check size={16} />
                {confirm.isPending ? '확정 중…' : dirty ? '저장하고 근무표 확정' : '근무표 확정'}
              </button>
            </div>
          </>
        )}
      </section>
      <button
        className="text-link"
        disabled={busy || !navigator.onLine}
        onClick={() => {
          if (!dirty || window.confirm('저장하지 않은 변경을 버리고 저장된 내용을 불러올까요?'))
            reload.mutate();
        }}
      >
        저장 내용 다시 불러오기
      </button>
      {editing && (
        <ShiftRowEditor
          row={editing}
          employees={employees}
          readOnly={confirmed}
          close={() => setEditing(null)}
          apply={updateRow}
          remove={() => {
            changed(rows.filter((row) => row.id !== editing.id));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ShiftRowEditor({
  row,
  employees,
  readOnly,
  close,
  apply,
  remove,
}: {
  row: ShiftDraft;
  employees: Employee[];
  readOnly: boolean;
  close: () => void;
  apply: (row: ShiftDraft) => void;
  remove: () => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(row));
  const dirty = JSON.stringify(draft) !== JSON.stringify(row);
  const issues = analyzeShifts([draft], employees).filter(
    (issue) => !['UNREVIEWED', 'BREAK_MISSING'].includes(issue.code),
  );
  function patch(value: Partial<ShiftDraft>) {
    setDraft((old) => ({ ...old, ...value, reviewed: false }));
  }
  return (
    <Modal
      title={`${employees.find((employee) => employee.id === row.employee_id)?.name || row.raw_employee_name || '새 근무'} · 근무 상세`}
      dirty={dirty && !readOnly}
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply(draft);
        }}
      >
        <fieldset disabled={readOnly}>
          <label className="field">
            직원
            <select
              value={draft.employee_id ?? ''}
              onChange={(e) => patch({ employee_id: e.target.value || null })}
            >
              <option value="">직원을 선택해 주세요</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-grid">
            <label className="field">
              출근 날짜 · 시간
              <input
                type="datetime-local"
                value={draft.starts_at}
                onChange={(e) => patch({ starts_at: e.target.value })}
              />
            </label>
            <label className="field">
              퇴근 날짜 · 시간
              <input
                type="datetime-local"
                value={draft.ends_at}
                onChange={(e) => patch({ ends_at: e.target.value })}
              />
            </label>
          </div>
          <p className="schedule-section-note">
            자정 이후 퇴근은 종료 날짜가 다음 날인지 확인해 주세요.
          </p>
          <label className="field">
            휴게 시간 (분)
            <input
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={draft.break_minutes ?? ''}
              onChange={(e) =>
                patch({ break_minutes: e.target.value === '' ? null : Number(e.target.value) })
              }
              placeholder="공통 설정과 다를 때만 수정"
            />
          </label>
        </fieldset>
        <div className="schedule-row-comparison">
          <span>
            출퇴근 기준 <b>{hours(elapsed(draft))}</b>
          </span>
          <span>
            실근무 <b>{hours(netMinutes(draft))}</b>
          </span>
          {draft.reported_hours != null && (
            <span>
              원문 기재 <b>{draft.reported_hours}시간</b>
            </span>
          )}
        </div>
        {issues.length > 0 && (
          <div className="shift-issues">
            <ul>
              {issues.map((issue) => (
                <li key={issue.code}>{issue.message}</li>
              ))}
            </ul>
          </div>
        )}
        {sourceWarnings(draft).length > 0 && (
          <div className="info-box">
            <ul>
              {sourceWarnings(draft).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
        {reportedMismatch(draft) && (
          <div className="info-box">
            원문 시간과 계산 시간이 다릅니다. 출퇴근 시각과 휴게 시간을 확인해 주세요.
          </div>
        )}
        {!readOnly && (
          <>
            <label className="shift-reviewed">
              <input
                type="checkbox"
                checked={draft.reviewed}
                onChange={(e) => setDraft({ ...draft, reviewed: e.target.checked })}
              />
              이 근무의 원문·직원·시간을 확인했습니다.
            </label>
            <div className="upload-actions">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (window.confirm('이 근무를 초안에서 삭제할까요?')) remove();
                }}
              >
                <Trash2 size={15} />
                삭제
              </button>
              <button className="btn primary">수정 내용 적용</button>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
