import { shiftTime, type ConfirmedShift, type Employee, type WorkSchedule } from './schedules';
import { today } from './format';

export async function exportScheduleWorkbook(
  rows: ConfirmedShift[],
  employees: Employee[],
  documents: WorkSchedule[],
  workspace: string,
) {
  const imported = await import('exceljs');
  const ExcelJS = imported.default ?? imported;
  const book = new ExcelJS.Workbook();
  book.creator = 'ZC FNB';
  book.created = new Date();
  const sheet = book.addWorksheet('확정 근무일정', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: '사업장', key: 'workspace', width: 20 },
    { header: '직원', key: 'employee', width: 22 },
    { header: '시작 일시', key: 'start', width: 23 },
    { header: '종료 일시', key: 'end', width: 23 },
    { header: '출퇴근 기준(분)', key: 'elapsed', width: 18 },
    { header: '휴게(분)', key: 'break', width: 13 },
    { header: '휴게 제외(분)', key: 'net', width: 15 },
    { header: '원문 기재(시간)', key: 'reported', width: 18 },
    { header: '원본 근무표', key: 'source', width: 32 },
    { header: '근무표 용도', key: 'kind', width: 20 },
  ];
  for (const row of rows) {
    const elapsed = (shiftTime(row.ends_at) - shiftTime(row.starts_at)) / 60000;
    sheet.addRow({
      workspace,
      employee:
        employees.find((employee) => employee.id === row.employee_id)?.name ??
        row.raw_employee_name,
      start: row.starts_at.replace('T', ' '),
      end: row.ends_at.replace('T', ' '),
      elapsed,
      break: row.break_minutes ?? '',
      net: row.break_minutes == null ? '' : elapsed - row.break_minutes,
      reported: row.reported_hours ?? '',
      source: documents.find((doc) => doc.schedule_id === row.schedule_id)?.file_name ?? '',
      kind: kindLabel(documents.find((doc) => doc.schedule_id === row.schedule_id)?.record_kind),
    });
  }
  const totals = book.addWorksheet('직원별 합계', { views: [{ state: 'frozen', ySplit: 1 }] });
  totals.columns = [
    { header: '직원', key: 'employee', width: 22 },
    { header: '근무 횟수', key: 'count', width: 14 },
    { header: '출퇴근 합계(시간)', key: 'elapsed', width: 21 },
    { header: '휴게 합계(시간)', key: 'break', width: 20 },
    { header: '휴게 제외 합계(시간)', key: 'net', width: 21 },
    { header: '근무표 용도', key: 'kind', width: 20 },
  ];
  const groupKey = (row: ConfirmedShift) =>
    JSON.stringify([
      row.employee_id ?? row.raw_employee_name,
      documents.find((doc) => doc.schedule_id === row.schedule_id)?.record_kind ?? 'UNSPECIFIED',
    ]);
  for (const key of new Set(rows.map(groupKey))) {
    const selected = rows.filter((row) => groupKey(row) === key);
    const id = selected[0].employee_id;
    const elapsed = selected.reduce(
      (sum, row) => sum + (shiftTime(row.ends_at) - shiftTime(row.starts_at)) / 3600000,
      0,
    );
    const knownBreaks = selected.every((row) => row.break_minutes != null);
    const breaks = knownBreaks
      ? selected.reduce((sum, row) => sum + row.break_minutes!, 0) / 60
      : null;
    totals.addRow({
      employee:
        employees.find((employee) => employee.id === id)?.name ?? selected[0].raw_employee_name,
      count: selected.length,
      elapsed,
      break: breaks ?? '',
      net: breaks == null ? '' : elapsed - breaks,
      kind: kindLabel(
        documents.find((doc) => doc.schedule_id === selected[0].schedule_id)?.record_kind,
      ),
    });
  }
  for (const tab of [sheet, totals]) {
    tab.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, tab.rowCount), column: tab.columnCount },
    };
    tab.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    tab.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF27634A' } };
    tab.getRow(1).height = 27;
  }
  for (const column of [3, 4, 5]) totals.getColumn(column).numFmt = '0.00';
  const buffer = await book.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(buffer)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `ZC-FNB-근무일정-${today()}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function kindLabel(kind: WorkSchedule['record_kind']) {
  return kind === 'PLANNED' ? '예정 근무표' : kind === 'WORKED' ? '지난 근무 현황' : '용도 미지정';
}
