import { Link } from 'react-router-dom';
import { shiftTime, type ConfirmedShift, type Employee } from '../shared/schedules';
import { Empty } from '../shared/ui';

export function DayTimeline({
  date,
  rows,
  employees,
}: {
  date: string;
  rows: ConfirmedShift[];
  employees: Employee[];
}) {
  const start = shiftTime(`${date}T00:00`),
    end = start + 86400000;
  const shown = rows.filter(
    (row) => shiftTime(row.starts_at) < end && shiftTime(row.ends_at) > start,
  );
  const groupKey = (row: ConfirmedShift) =>
    JSON.stringify([row.employee_id ?? row.raw_employee_name, row.record_kind ?? 'UNSPECIFIED']);
  if (!shown.length)
    return (
      <Empty title="이 날짜에 확정된 근무가 없습니다">
        <p>날짜 또는 직원 필터를 변경해 주세요.</p>
      </Empty>
    );
  return (
    <div className="day-timeline-wrap">
      <div className="day-timeline">
        <div className="timeline-header">
          <strong>직원 / 시간</strong>
          <div className="timeline-hours">
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i}>{String(i * 2).padStart(2, '0')}:00</span>
            ))}
          </div>
        </div>
        {[...new Set(shown.map(groupKey))].map((key) => {
          const employeeRows = shown
            .filter((row) => groupKey(row) === key)
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
          const id = employeeRows[0].employee_id;
          return (
            <div className="timeline-row" key={key}>
              <strong>
                {employees.find((e) => e.id === id)?.name ?? employeeRows[0].raw_employee_name}
                <small>
                  {employeeRows[0].record_kind === 'PLANNED'
                    ? '예정'
                    : employeeRows[0].record_kind === 'WORKED'
                      ? '지난 근무'
                      : '용도 미지정'}
                </small>
              </strong>
              <div className="timeline-track">
                {employeeRows.map((row) => {
                  const from = Math.max(start, shiftTime(row.starts_at)),
                    to = Math.min(end, shiftTime(row.ends_at));
                  const label = `${row.starts_at.slice(0, 10) < date ? '전날 ' : ''}${row.starts_at.slice(11)} ~ ${row.ends_at.slice(0, 10) > date ? '익일 ' : ''}${row.ends_at.slice(11)}`;
                  return (
                    <Link
                      key={`${row.schedule_id}-${row.id}`}
                      to={`/schedules/${row.schedule_id}`}
                      title={`${label} · 휴게 ${row.break_minutes}분`}
                      style={{
                        left: `${(from - start) / 864000}%`,
                        width: `${(to - from) / 864000}%`,
                      }}
                    >
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
