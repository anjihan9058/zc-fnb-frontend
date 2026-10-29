import { createId } from './id';
import { shiftTime, type ShiftDraft } from './schedules';
const shiftPattern = /^(?:(\d{4})[./-])?(\d{1,2})[./-](\d{1,2})\s+(\d{1,2}):(\d{2})\s*[~～∼〜–—-]\s*(\d{1,2}):(\d{2})(?:\s+(\d+(?:\.\d+)?)\s*(?:시간|h)?)?\s*$/i;
const totalPattern = /^(?:총\s*)?근무\s*시간\s*[:：]\s*(\d+(?:\.\d+)?)/;
export function looksLikeSchedule(text: string) { return text.split(/\r?\n/).some((line) => shiftPattern.test(line.trim())); }
export interface TextEmployeeSummary { name: string; count: number; calculated_hours: number; reported_hours: number | null; }
export function parseScheduleText(text: string, year: number) {
  const shifts: ShiftDraft[] = [], errors: string[] = [], notes: string[] = [];
  const staff: TextEmployeeSummary[] = [];
  let name = '';
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { shifts, errors: ['근무 연도를 2000~2100 사이로 입력해 주세요.'], notes, staff };
  if (text.length > 50000) return { shifts, errors: ['근무표 텍스트는 50,000자 이내로 입력해 주세요.'], notes, staff };
  const getStaff = () => {
    let employee = staff.find((item) => item.name === name);
    if (!employee) { employee = { name, count: 0, calculated_hours: 0, reported_hours: null }; staff.push(employee); }
    return employee;
  };
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim(); if (!line) return;
    const total = line.match(totalPattern);
    if (total) { if (name) getStaff().reported_hours = Number(total[1]); else notes.push(`${index + 1}줄: 직원 이름 앞의 합계는 연결하지 않았습니다.`); return; }
    const match = line.match(shiftPattern);
    if (match) {
      if (!name) { errors.push(`${index + 1}줄: 근무 내역 위에 직원 이름을 적어 주세요.`); return; }
      const [, explicitYear, month, day, startHour, startMinute, endHour, endMinute, reported] = match;
      const actualYear = explicitYear ? Number(explicitYear) : year;
      if (actualYear < 2000 || actualYear > 2100) { errors.push(`${index + 1}줄: 근무 연도를 확인해 주세요.`); return; }
      const pad = (value: string | number) => String(value).padStart(2, '0');
      const date = `${actualYear}-${pad(month)}-${pad(day)}`;
      const startMinutes = Number(startHour) * 60 + Number(startMinute);
      const endMinutes = Number(endHour) * 60 + Number(endMinute);
      if (Number(startHour) > 23 || Number(startMinute) > 59 || Number(endHour) > 24 || Number(endMinute) > 59 || (Number(endHour) === 24 && Number(endMinute) !== 0)) { errors.push(`${index + 1}줄: 시각 범위를 확인해 주세요.`); return; }
      const starts_at = `${date}T${pad(startHour)}:${startMinute}`;
      if (!Number.isFinite(shiftTime(starts_at))) { errors.push(`${index + 1}줄: 존재하지 않는 근무 날짜입니다.`); return; }
      const nextDay = endMinutes <= startMinutes || Number(endHour) === 24;
      const next = new Date(`${date}T12:00:00Z`); if (nextDay) next.setUTCDate(next.getUTCDate() + 1);
      const ends_at = `${next.toISOString().slice(0, 10)}T${pad(Number(endHour) % 24)}:${endMinute}`;
      const hours = (shiftTime(ends_at) - shiftTime(starts_at)) / 3600000;
      const warnings = ['휴게 시간이 원문에 없어 직접 확인이 필요합니다.'];
      if (startMinutes === endMinutes) warnings.push('시작·종료 시각이 같아 24시간 근무로 표시했습니다. 원본을 확인해 주세요.');
      if (reported && Math.abs(Number(reported) - hours) > .001) warnings.push(`원문 ${reported}시간과 출퇴근 시각 기준 ${hours}시간이 다릅니다. 휴게·시간 표기를 확인해 주세요.`);
      if (explicitYear && actualYear !== year) notes.push(`${index + 1}줄은 원문에 적힌 ${actualYear}년을 사용했습니다.`);
      shifts.push({ id: createId(), employee_id: null, raw_employee_name: name, starts_at, ends_at, break_minutes: null, warnings, reviewed: false, ...(reported ? { reported_hours: Number(reported) } : {}) });
      const employee = getStaff(); employee.count++; employee.calculated_hours += hours;
      return;
    }
    if (/^\d{1,2}월\s|^\d{4}년|근무표|근무\s*$/.test(line) && !/^\d{1,2}[./]/.test(line)) return;
    if (/^[가-힣a-zA-Z][가-힣a-zA-Z\s.'·-]{0,59}$/.test(line)) { name = line; return; }
    errors.push(`${index + 1}줄을 해석하지 못했습니다: ${line.slice(0, 70)}`);
  });
  if (!shifts.length && !errors.length) errors.push('날짜와 출퇴근 시각이 있는 근무 내역을 찾지 못했습니다.');
  for (const employee of staff) {
    if (employee.reported_hours != null && Math.abs(employee.reported_hours - employee.calculated_hours) > .001) notes.push(`${employee.name}: 원문 합계 ${employee.reported_hours}시간 / 출퇴근 시각 합계 ${employee.calculated_hours}시간. 합계 차이를 확인해 주세요.`);
  }
  return { shifts, errors, notes, staff: staff.filter((employee) => employee.count > 0) };
}
