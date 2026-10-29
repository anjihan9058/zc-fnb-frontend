import { useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarDays } from 'lucide-react';
import { scheduleApi } from '../shared/api';
import { parseScheduleText } from '../shared/scheduleText';
import { ErrorState, Modal, useToast } from '../shared/ui';
import { useRefresh } from '../app/hooks';

export function ScheduleTextDialog({
  text,
  room,
  messageId,
  close,
}: {
  text: string;
  room: string;
  messageId?: string;
  close: () => void;
}) {
  const [source, setSource] = useState(text);
  const [recordKind, setRecordKind] = useState<'' | 'PLANNED' | 'WORKED'>('');
  const [yearText, setYearText] = useState('');
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [createUnknown, setCreateUnknown] = useState(false);
  const [showSource, setShowSource] = useState(!text.trim());
  const employees = useQuery({ queryKey: ['employees'], queryFn: scheduleApi.employees });
  const year = Number(yearText);
  const parsed = useMemo(() => parseScheduleText(source, year), [source, year]);
  const refresh = useRefresh();
  const navigate = useNavigate();
  const toast = useToast();
  const choiceFor = (name: string) =>
    choices[name] ??
    employees.data?.find((employee) => employee.name.trim() === name.trim())?.id ??
    (createUnknown ? '__new__' : '');
  const unresolved = parsed.staff.filter((employee) => !choiceFor(employee.name));
  const create = useMutation({
    mutationFn: () => {
      if (parsed.errors.length || !parsed.shifts.length || unresolved.length)
        throw new Error('연도·직원 연결·원문 형식을 먼저 확인해 주세요.');
      return scheduleApi.importText({
        text: source,
        room_id: room,
        year,
        source_message_id: messageId,
        ...(recordKind ? { record_kind: recordKind } : {}),
        employees: parsed.staff.map((employee) => {
          const selected = choiceFor(employee.name);
          return {
            raw_name: employee.name,
            employee_id: selected === '__new__' ? null : selected,
            create: selected === '__new__',
          };
        }),
      });
    },
    onSuccess: async (doc) => {
      await refresh();
      toast('텍스트 근무표를 쉬프트 초안으로 정리했습니다.');
      flushSync(close);
      navigate(`/schedules/${encodeURIComponent(doc.schedule_id)}`);
    },
  });
  return (
    <Modal
      title="근무 현황을 근무표로 정리"
      dirty={
        source !== text ||
        !!yearText ||
        !!recordKind ||
        createUnknown ||
        Object.keys(choices).length > 0
      }
      busy={create.isPending}
      close={close}
      wide
    >
      <div className="info-box">
        <CalendarDays size={19} />
        <span>
          근무 내역 전체를 표로 정리한 뒤, 시간 차이·누락·겹침이 있는 부분만 골라 확인합니다.
        </span>
      </div>
      <p className="schedule-section-note">
        선택한 긴 근무 현황 텍스트만 정리합니다. 다른 채팅이나 일반 대화는 분석하지 않습니다.
      </p>
      <label className="field">
        근무표 용도
        <select
          value={recordKind}
          onChange={(e) => setRecordKind(e.target.value as typeof recordKind)}
          disabled={create.isPending}
        >
          <option value="">아직 지정하지 않음</option>
          <option value="WORKED">지난 근무 현황</option>
          <option value="PLANNED">예정 근무표</option>
        </select>
      </label>
      <label className="field">
        근무 연도 (원문에 없는 연도를 확인해 입력)
        <input
          type="number"
          inputMode="numeric"
          min="2000"
          max="2100"
          placeholder="예: 2026"
          value={yearText}
          onChange={(e) => setYearText(e.target.value)}
          disabled={create.isPending}
        />
      </label>
      <details
        className="schedule-import-source"
        open={showSource}
        onToggle={(e) => setShowSource(e.currentTarget.open)}
      >
        <summary>
          원문 근무표 {source.trim() ? '보기·수정' : '붙여넣기'}
          <span>{source.length.toLocaleString()}자</span>
        </summary>
        <label className="field">
          <span className="sr-only">원문 근무표</span>
          <textarea
            className="schedule-source-input"
            value={source}
            maxLength={50000}
            onChange={(e) => setSource(e.target.value)}
            disabled={create.isPending}
            placeholder={
              '10월 우리 가게 근무\n직원 이름\n10/1 15:00 ~ 00:30 9.5\n총 근무시간 : 9.5'
            }
          />
        </label>
      </details>
      {employees.error && <ErrorState error={employees.error} retry={() => employees.refetch()} />}
      {yearText && parsed.errors.length > 0 && (
        <div className="shift-issues">
          <strong>해석하지 못한 부분 {parsed.errors.length}개</strong>
          <ul>
            {parsed.errors.slice(0, 4).map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
          {parsed.errors.length > 4 && (
            <details>
              <summary>나머지 오류 보기</summary>
              <ul>
                {parsed.errors.slice(4).map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </details>
          )}
          <button className="text-link" onClick={() => setShowSource(true)}>
            원문 펼쳐 수정하기
          </button>
        </div>
      )}
      {parsed.staff.length > 0 && (
        <>
          <div className="schedule-import-overview">
            <div>
              <span>직원</span>
              <strong>{parsed.staff.length}명</strong>
            </div>
            <div>
              <span>정리된 근무</span>
              <strong>{parsed.shifts.length}건</strong>
            </div>
            <div>
              <span>합계·표기 확인</span>
              <strong>{parsed.notes.length}개</strong>
            </div>
          </div>
          <p className="schedule-section-note">
            아래에서 직원을 연결하면 전체 근무표가 열립니다. 휴게 시간은 그 화면에서 공통 설정하고
            예외만 수정합니다.
          </p>
          {parsed.notes.length > 0 && (
            <div className="shift-issues">
              <strong>먼저 확인할 부분</strong>
              <ul>
                {parsed.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          )}
          <label className="shift-reviewed">
            <input
              type="checkbox"
              checked={createUnknown}
              onChange={(e) => setCreateUnknown(e.target.checked)}
              disabled={create.isPending}
            />
            미등록 이름을 현재 사업장의 새 직원으로 등록
          </label>
          <div className="text-schedule-staff">
            {parsed.staff.map((employee) => (
              <div key={employee.name}>
                <div>
                  <strong>{employee.name}</strong>
                  <small>
                    {employee.count}회 · 시각 기준 {employee.calculated_hours}시간
                    {employee.reported_hours != null
                      ? ` / 원문 합계 ${employee.reported_hours}시간`
                      : ''}
                  </small>
                </div>
                <label className="field">
                  <span className="sr-only">{employee.name} 직원 연결</span>
                  <select
                    value={choiceFor(employee.name)}
                    onChange={(e) => setChoices({ ...choices, [employee.name]: e.target.value })}
                    disabled={create.isPending}
                  >
                    <option value="">직원 연결 선택</option>
                    <option value="__new__">{employee.name} · 새 직원 등록</option>
                    {employees.data?.map((registered) => (
                      <option key={registered.id} value={registered.id}>
                        {registered.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          </div>
        </>
      )}
      {create.error && <ErrorState error={create.error} />}
      <div className="upload-actions">
        <button
          className="btn primary"
          disabled={
            create.isPending ||
            employees.isPending ||
            !!employees.error ||
            !yearText ||
            parsed.errors.length > 0 ||
            !parsed.shifts.length ||
            unresolved.length > 0 ||
            !navigator.onLine
          }
          onClick={() => create.mutate()}
        >
          {create.isPending ? '정리 중…' : `${yearText || '선택 연도'}년 쉬프트 초안 만들기`}
          <ArrowRight size={17} />
        </button>
      </div>
    </Modal>
  );
}
