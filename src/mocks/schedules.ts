import { createId } from '../shared/id';
import { get, set } from 'idb-keyval';
import type { Employee, ScheduleApi, WorkSchedule, ShiftDraft } from '../shared/schedules';
import { shiftIssues } from '../shared/schedules';
import { today } from '../shared/format';
import { fileHash } from '../shared/id';
import { defaultWorkspace, getWorkspaceId, workspaceStorageKey } from '../shared/workspaces';
import { parseScheduleText } from '../shared/scheduleText';
type Store = { documents: WorkSchedule[]; employees: Employee[] };
let queue: Promise<unknown> = Promise.resolve();
function db<T>(action: (store: Store) => T): Promise<T> {
  const KEY = workspaceStorageKey('sikjangbu-schedules-v1');
  const isDefault = getWorkspaceId() === defaultWorkspace.id;
  const run = async () => {
    if (!navigator.onLine) throw new Error('오프라인입니다. 연결 후 다시 시도해 주세요.');
    const store: Store = (await get<Store>(KEY)) ?? {
      documents: [],
      employees: isDefault
        ? [
            { id: 'demo-employee-1', name: '김민수 (가상 직원)' },
            { id: 'demo-employee-2', name: '이서연 (가상 직원)' },
            { id: 'demo-employee-3', name: '박지훈 (가상 직원)' },
          ]
        : [],
    };
    store.documents.forEach((d) => {
      if (!['UPLOADED', 'PROCESSING'].includes(d.status)) return;
      const elapsed = Date.now() - Date.parse(d.created_at);
      if (elapsed > 2500) d.status = 'NEEDS_REVIEW';
      else if (elapsed > 500) d.status = 'PROCESSING';
    });
    const result = action(store);
    await set(KEY, store);
    return structuredClone(result);
  };
  const locked = async (): Promise<T> =>
    navigator.locks ? await navigator.locks.request(KEY, run) : await run();
  const result = queue.then(locked, locked);
  queue = result.catch(() => {});
  return result;
}
function find(store: Store, id: string) {
  const doc = store.documents.find((d) => d.schedule_id === id);
  if (!doc) throw new Error('근무표를 찾을 수 없습니다.');
  return doc;
}
function editable(doc: WorkSchedule, version: number) {
  if (doc.version !== version)
    throw new Error('다른 창에서 변경되었습니다. 저장 내용을 다시 불러와 주세요.');
  if (doc.status !== 'NEEDS_REVIEW')
    throw new Error('현재 상태에서는 근무표를 수정할 수 없습니다.');
}
function create(room: string, demo: WorkSchedule['demo']): WorkSchedule {
  return {
    schedule_id: createId(),
    room_id: room,
    version: 1,
    status: 'UPLOADED',
    created_at: new Date().toISOString(),
    file_name: '가상 근무표',
    file_type: 'image/svg+xml',
    image_url: null,
    shifts: [],
    demo,
  };
}
export const mockScheduleApi: ScheduleApi = {
  list: () => db((s) => s.documents),
  get: (id) => db((s) => find(s, id)),
  employees: () => db((s) => s.employees),
  addEmployee: (name) =>
    db((s) => {
      const clean = name.trim();
      if (!clean || clean.length > 60) throw new Error('직원 이름은 1~60자로 입력해 주세요.');
      if (s.employees.some((e) => e.name === clean))
        throw new Error('같은 이름이 있습니다. 구분할 이름을 입력해 주세요.');
      const employee = { id: createId(), name: clean };
      s.employees.push(employee);
      return employee;
    }),
  shifts: () =>
    db((s) =>
      s.documents
        .filter((d) => d.status === 'CONFIRMED')
        .flatMap((d) =>
          d.shifts.map((row) => ({
            ...row,
            schedule_id: d.schedule_id,
            record_kind: d.record_kind,
          })),
        ),
    ),
  upload: async (file, room) => {
    const hash = await fileHash(file);
    const image = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
      reader.readAsDataURL(file);
    });
    return db((s) => {
      if (s.documents.some((d) => (hash && d.content_hash === hash) || d.image_url === image))
        throw new Error('이미 올린 근무표입니다. 근무표 목록에서 확인해 주세요.');
      const doc = create(room, 'manual');
      Object.assign(doc, {
        file_name: file.name,
        file_type: file.type,
        image_url: image,
        content_hash: hash,
      });
      s.documents.unshift(doc);
      return { schedule_id: doc.schedule_id };
    });
  },
  importText: (input) =>
    db((s) => {
      const parsed = parseScheduleText(input.text, input.year);
      if (parsed.errors.length) throw new Error(parsed.errors.join('\n'));
      const existing = s.documents.find(
        (doc) =>
          (input.source_message_id &&
            doc.source_message_id === input.source_message_id &&
            doc.import_year === input.year) ||
          (doc.source_text === input.text && doc.import_year === input.year),
      );
      if (existing) return { schedule_id: existing.schedule_id };
      const assignments = new Map<string, string>();
      for (const employee of parsed.staff) {
        const choice = input.employees.find((item) => item.raw_name === employee.name);
        if (choice?.employee_id) {
          if (!s.employees.some((item) => item.id === choice.employee_id))
            throw new Error(`${employee.name}의 직원을 다시 선택해 주세요.`);
          assignments.set(employee.name, choice.employee_id);
        } else if (choice?.create) {
          let registered = s.employees.find((item) => item.name === employee.name);
          if (!registered) {
            registered = { id: createId(), name: employee.name };
            s.employees.push(registered);
          }
          assignments.set(employee.name, registered.id);
        } else throw new Error(`${employee.name}의 직원 연결 또는 새 직원 등록을 선택해 주세요.`);
      }
      const doc = create(input.room_id, 'text');
      Object.assign(doc, {
        status: 'NEEDS_REVIEW',
        file_name: `${input.year}년 텍스트 근무표`,
        file_type: 'text/plain',
        source_text: input.text,
        source_message_id: input.source_message_id,
        import_year: input.year,
        record_kind: input.record_kind,
        source_notes: parsed.notes,
        reported_totals: parsed.staff
          .filter((employee) => employee.reported_hours != null)
          .map((employee) => ({ name: employee.name, hours: employee.reported_hours! })),
        shifts: parsed.shifts.map((shift) => ({
          ...shift,
          employee_id: assignments.get(shift.raw_employee_name) ?? null,
        })),
      });
      s.documents.unshift(doc);
      return { schedule_id: doc.schedule_id };
    }),
  save: (id, rows, version) =>
    db((s) => {
      const doc = find(s, id);
      editable(doc, version);
      doc.shifts = structuredClone(rows);
      doc.version++;
    }),
  confirm: (id, version, _key) =>
    db((s) => {
      const doc = find(s, id);
      if (doc.status === 'CONFIRMED') return;
      editable(doc, version);
      const existing = s.documents
        .filter((d) => d.status === 'CONFIRMED')
        .flatMap((d) =>
          d.shifts.map((row) => ({
            ...row,
            schedule_id: d.schedule_id,
            record_kind: d.record_kind,
          })),
        );
      const issues = shiftIssues(doc.shifts, s.employees, existing, doc.record_kind);
      if (issues.length) throw new Error(issues.join('\n'));
      doc.status = 'CONFIRMED';
      doc.version++;
    }),
  retry: (id) =>
    db((s) => {
      const doc = find(s, id);
      if (doc.status !== 'FAILED') throw new Error('실패한 근무표만 재시도할 수 있습니다.');
      doc.status = 'UPLOADED';
      doc.error = undefined;
      doc.created_at = new Date().toISOString();
      doc.version++;
    }),
  sample: (room) =>
    db((s) => {
      const doc = create(room, 'sample');
      doc.image_url = '/samples/work-schedule.svg';
      const day = today();
      doc.shifts = [
        {
          id: createId(),
          employee_id: s.employees.find((e) => e.id === 'demo-employee-1')?.id ?? null,
          raw_employee_name: '김민수',
          starts_at: `${day}T09:00`,
          ends_at: `${day}T18:00`,
          break_minutes: 60,
          warnings: [],
          reviewed: false,
        },
        {
          id: createId(),
          employee_id: null,
          raw_employee_name: '이서?',
          starts_at: `${day}T12:00`,
          ends_at: `${day}T20:00`,
          break_minutes: null,
          warnings: ['직원 이름과 휴게 시간 확인 필요'],
          reviewed: false,
        },
      ] satisfies ShiftDraft[];
      s.documents.unshift(doc);
      return { schedule_id: doc.schedule_id };
    }),
};
