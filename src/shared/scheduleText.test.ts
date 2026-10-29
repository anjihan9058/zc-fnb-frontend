import { describe, expect, it } from 'vitest';
import { looksLikeSchedule, parseScheduleText } from './scheduleText';
import { analyzeShifts, shiftIssues, shiftTime, type ShiftDraft } from './schedules';

const source = '10월 우리 가게 근무\n직원 가\n10/1 15:00 ~ 00:30 9.5\n10/2 18:00~22:00 4\n총 근무시간 : 13.5\n직원 나\n10/3 17:30 ~ 24:00 6.5';
const valid: ShiftDraft = { id: 'one', employee_id: 'a', raw_employee_name: '직원 가', starts_at: '2026-10-01T15:00', ends_at: '2026-10-02T00:30', break_minutes: 30, reviewed: true, warnings: [] };
describe('텍스트 근무표 해석', () => {
  it('직원별 정리·공백 차이·자정·24시와 원문 합계를 보존한다', () => {
    const result = parseScheduleText(source, 2026);
    expect(result.errors).toEqual([]);
    expect(result.shifts).toHaveLength(3);
    expect(result.staff.map((s) => [s.name, s.count, s.calculated_hours, s.reported_hours])).toEqual([['직원 가', 2, 13.5, 13.5], ['직원 나', 1, 6.5, null]]);
    expect(result.shifts[0].ends_at).toBe('2026-10-02T00:30');
    expect(result.shifts[2].ends_at).toBe('2026-10-04T00:00');
    expect(result.shifts.every((s) => s.break_minutes === null && !s.reviewed && s.employee_id === null)).toBe(true);
    expect(result.shifts[0].reported_hours).toBe(9.5);
  });
  it.each(['~', '～', '∼', '〜', '–', '—', '-'])('%s 시간 구분자를 지원한다', (separator) => {
    expect(parseScheduleText(`직원 가\n10/1 18:00 ${separator} 22:00 4`, 2026).shifts).toHaveLength(1);
  });
  it('연말 야간 근무를 다음 해로 넘긴다', () => {
    const result = parseScheduleText('직원 가\n12/31 22:00 ~ 01:00 3', 2026);
    expect(result.shifts[0].ends_at).toBe('2027-01-01T01:00');
  });
  it.each(['2/29 18:00 ~ 22:00', '10/32 18:00 ~ 22:00', '10/1 25:00 ~ 22:00', '10/1 18:60 ~ 22:00', '10/1 18:00 ~ 24:30'])('존재하지 않는 날짜·시각 %s를 거절한다', (line) => {
    const result = parseScheduleText(`직원 가\n${line}`, 2026);
    expect(result.errors.length).toBeGreaterThan(0); expect(result.shifts).toEqual([]);
  });
  it('윤년의 2월 29일은 보존한다', () => { expect(parseScheduleText('직원 가\n2/29 18:00 ~ 22:00', 2028).shifts).toHaveLength(1); });
  it('원문 합계 차이와 행별 시간 차이를 표시한다', () => {
    const result = parseScheduleText('직원 가\n10/1 18:00 ~ 22:00 5\n총 근무시간 : 9', 2026);
    expect(result.shifts[0].warnings.some((w) => w.includes('다릅니다'))).toBe(true);
    expect(result.notes.some((w) => w.includes('9시간') && w.includes('4시간'))).toBe(true);
  });
  it('이름 없는 행·알 수 없는 줄·연도 누락을 조용히 버리지 않는다', () => {
    expect(parseScheduleText('10/1 18:00 ~ 22:00', 2026).errors[0]).toContain('직원 이름');
    expect(parseScheduleText('직원 가\n10/1 18:00 ~ 22:00\n10/2 시간불명', 2026).errors[0]).toContain('3줄');
    expect(parseScheduleText(source, 0).errors[0]).toContain('연도');
  });
  it('같은 출퇴근 시각은 24시간으로 표시하고 확인 경고를 남긴다', () => {
    const row = parseScheduleText('직원 가\n10/1 18:00 ~ 18:00', 2026).shifts[0];
    expect((shiftTime(row.ends_at) - shiftTime(row.starts_at)) / 3600000).toBe(24);
    expect(row.warnings.some((w) => w.includes('24시간'))).toBe(true);
  });
  it('일반 대화와 근무표를 구별하고 과도한 입력을 제한한다', () => {
    expect(looksLikeSchedule('내일 재료 확인 부탁합니다.')).toBe(false);
    expect(looksLikeSchedule(source)).toBe(true);
    expect(parseScheduleText('가'.repeat(50001), 2026).errors[0]).toContain('50,000');
  });
});
describe('전체 근무표의 오류 분류와 확정 조건', () => {
  it('정상 야간 근무는 확정할 수 있다', () => { expect(shiftIssues([valid], [{ id: 'a', name: '직원 가' }])).toEqual([]); });
  it('같은 직원 시간 겹침은 양쪽 행에서 찾고 경계가 닿는 근무는 허용한다', () => {
    const overlapping = { ...valid, id: 'two', starts_at: '2026-10-01T23:00', ends_at: '2026-10-02T02:00' };
    expect(analyzeShifts([valid, overlapping], [{ id: 'a', name: '직원 가' }]).filter((i) => i.code === 'OVERLAP').map((i) => i.index)).toEqual([0, 1]);
    expect(shiftIssues([valid, { ...overlapping, starts_at: valid.ends_at }], [{ id: 'a', name: '직원 가' }])).toEqual([]);
  });
  it('다른 직원의 동시간 근무는 중복으로 보지 않는다', () => { expect(shiftIssues([valid, { ...valid, id: 'two', employee_id: 'b' }], [{ id: 'a', name: '가' }, { id: 'b', name: '나' }])).toEqual([]); });
  it('기존 확정 일정과의 충돌·미기재 휴게·미확인·미연결 직원을 분리한다', () => {
    const issues = analyzeShifts([{ ...valid, break_minutes: null, reviewed: false }], [{ id: 'a', name: '가' }], [{ ...valid, schedule_id: 'other' }]);
    expect(issues.map((i) => i.code)).toEqual(expect.arrayContaining(['BREAK_MISSING', 'UNREVIEWED', 'OVERLAP']));
    expect(analyzeShifts([valid], []).map((i) => i.code)).toContain('EMPLOYEE');
  });
  it.each([-1, 1.5, 570, NaN])('잘못된 휴게 %s분을 거절한다', (value) => { expect(analyzeShifts([{ ...valid, break_minutes: value }], [{ id: 'a', name: '가' }]).map((i) => i.code)).toContain('BREAK_INVALID'); });
  it('중복 ID·불가능한 날짜·빈 문서는 확정을 막는다', () => {
    expect(analyzeShifts([valid, { ...valid }], [{ id: 'a', name: '가' }]).map((i) => i.code)).toContain('DUPLICATE');
    expect(Number.isNaN(shiftTime('2026-02-30T18:00'))).toBe(true);
    expect(shiftIssues([], [])).toHaveLength(1);
  });
});
