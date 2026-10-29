export type ScheduleStatus = 'UPLOADED' | 'PROCESSING' | 'NEEDS_REVIEW' | 'CONFIRMED' | 'FAILED';
export interface Employee {
  id: string;
  name: string;
}
export interface ShiftDraft {
  id: string;
  employee_id: string | null;
  raw_employee_name: string;
  starts_at: string;
  ends_at: string;
  break_minutes: number | null;
  warnings: string[];
  reviewed: boolean;
  reported_hours?: number;
}
export interface WorkSchedule {
  record_kind?: 'PLANNED' | 'WORKED';
  schedule_id: string;
  room_id: string;
  version: number;
  status: ScheduleStatus;
  created_at: string;
  file_name: string;
  file_type: string;
  image_url: string | null;
  shifts: ShiftDraft[];
  demo?: 'manual' | 'sample' | 'text';
  source_text?: string;
  source_message_id?: string;
  import_year?: number;
  source_notes?: string[];
  reported_totals?: { name: string; hours: number }[];
  content_hash?: string;
  error?: string;
}
export interface ConfirmedShift extends ShiftDraft {
  schedule_id: string;
  record_kind?: WorkSchedule['record_kind'];
}
export interface ScheduleApi {
  list(): Promise<WorkSchedule[]>;
  get(id: string): Promise<WorkSchedule>;
  employees(): Promise<Employee[]>;
  addEmployee(name: string): Promise<Employee>;
  shifts(): Promise<ConfirmedShift[]>;
  upload(file: File, room: string): Promise<{ schedule_id: string }>;
  importText(input: ScheduleTextImport): Promise<{ schedule_id: string }>;
  save(id: string, shifts: ShiftDraft[], version: number): Promise<void>;
  confirm(id: string, version: number, key: string): Promise<void>;
  retry(id: string): Promise<void>;
  sample(room: string): Promise<{ schedule_id: string }>;
}
export interface ScheduleTextImport {
  record_kind?: 'PLANNED' | 'WORKED';
  text: string;
  room_id: string;
  year: number;
  source_message_id?: string;
  employees: { raw_name: string; employee_id: string | null; create: boolean }[];
}
export const scheduleLabels: Record<ScheduleStatus, string> = {
  UPLOADED: '업로드 완료',
  PROCESSING: '근무표 분석 중',
  NEEDS_REVIEW: '쉬프트 확인 필요',
  CONFIRMED: '일정 반영 완료',
  FAILED: '분석 실패',
};
// Date/time inputs represent the business timezone, independent of the device timezone.
export const shiftTime = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return NaN;
  const parsed = Date.parse(`${value}:00+09:00`);
  if (!Number.isFinite(parsed)) return NaN;
  const roundTrip = new Date(parsed + 9 * 3600000).toISOString().slice(0, 16);
  return roundTrip === value ? parsed : NaN;
};
export type ShiftIssueCode =
  'DUPLICATE' | 'EMPLOYEE' | 'TIME' | 'BREAK_MISSING' | 'BREAK_INVALID' | 'UNREVIEWED' | 'OVERLAP';
export interface ShiftIssue {
  index: number;
  id: string;
  code: ShiftIssueCode;
  message: string;
}
export function analyzeShifts(
  rows: ShiftDraft[],
  employees: Employee[],
  existing: ConfirmedShift[] = [],
  recordKind?: WorkSchedule['record_kind'],
): ShiftIssue[] {
  const comparable = existing.filter(
    (shift) => !recordKind || !shift.record_kind || shift.record_kind === recordKind,
  );
  const issues: ShiftIssue[] = [];
  rows.forEach((row, index) => {
    const add = (code: ShiftIssueCode, message: string) =>
      issues.push({ index, id: row.id, code, message });
    if (!row.id || rows.some((other, i) => i !== index && other.id === row.id))
      add('DUPLICATE', '중복된 쉬프트 ID입니다.');
    if (!employees.some((employee) => employee.id === row.employee_id))
      add('EMPLOYEE', '직원 연결이 필요합니다.');
    const start = shiftTime(row.starts_at),
      end = shiftTime(row.ends_at);
    const validTime = Number.isFinite(start) && Number.isFinite(end) && end > start;
    if (!validTime) add('TIME', '시작·종료 날짜와 시간을 확인해 주세요.');
    if (row.break_minutes == null)
      add('BREAK_MISSING', '공통 휴게 시간을 적용하거나 이 행의 휴게 시간을 입력해 주세요.');
    else if (
      !Number.isInteger(row.break_minutes) ||
      row.break_minutes < 0 ||
      (validTime && row.break_minutes >= (end - start) / 60000)
    )
      add('BREAK_INVALID', '휴게 시간이 근무 길이와 맞지 않습니다.');
    if (!row.reviewed) add('UNREVIEWED', '전체 근무표 또는 이 행의 원본 확인이 필요합니다.');
    if (
      row.employee_id &&
      validTime &&
      [...rows.filter((_, i) => i !== index), ...comparable].some(
        (other) =>
          other.employee_id === row.employee_id &&
          start < shiftTime(other.ends_at) &&
          end > shiftTime(other.starts_at),
      )
    )
      add('OVERLAP', '같은 직원의 다른 근무와 시간이 겹칩니다.');
  });
  return issues;
}
export function shiftIssues(
  rows: ShiftDraft[],
  employees: Employee[],
  existing: ConfirmedShift[] = [],
  recordKind?: WorkSchedule['record_kind'],
) {
  if (!rows.length) return ['쉬프트를 한 개 이상 입력해 주세요.'];
  return analyzeShifts(rows, employees, existing, recordKind).map(
    (issue) => `${issue.index + 1}행: ${issue.message}`,
  );
}
