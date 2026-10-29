import { describe, it, expect } from 'vitest';
import { analyzeShifts, type ShiftDraft, type ConfirmedShift } from './schedules';
const row: ShiftDraft = {
  id: 'new',
  employee_id: 'e',
  raw_employee_name: '직원',
  starts_at: '2026-10-01T18:00',
  ends_at: '2026-10-01T22:00',
  break_minutes: 0,
  reviewed: true,
  warnings: [],
};
const employees = [{ id: 'e', name: '직원' }];
const planned: ConfirmedShift = {
  ...row,
  id: 'old',
  schedule_id: 'old-doc',
  record_kind: 'PLANNED',
};
describe('근무표 용도별 겹침 확인', () => {
  it('예정 근무와 지난 근무 현황을 서로의 중복으로 보지 않는다', () => {
    expect(analyzeShifts([row], employees, [planned], 'WORKED')).toEqual([]);
  });
  it('같은 용도의 겹침과 용도 미지정 기록은 계속 확인한다', () => {
    expect(
      analyzeShifts([row], employees, [planned], 'PLANNED').some((i) => i.code === 'OVERLAP'),
    ).toBe(true);
    expect(
      analyzeShifts([row], employees, [{ ...planned, record_kind: undefined }], 'WORKED').some(
        (i) => i.code === 'OVERLAP',
      ),
    ).toBe(true);
    expect(
      analyzeShifts([row, { ...row, id: 'second' }], employees, [], 'WORKED').some(
        (i) => i.code === 'OVERLAP',
      ),
    ).toBe(true);
  });
});
