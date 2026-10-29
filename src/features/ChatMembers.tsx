import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, UserRoundMinus, Users } from 'lucide-react';
import { chatManagementApi, isDemo } from '../shared/api';
import { useSessionUser } from '../app/SessionGate';
import type { ChatPerson } from '../shared/chat';
import { Empty, ErrorState, Loading, useToast } from '../shared/ui';

export function ChatMembers({ roomId }: { roomId: string }) {
  const user = useSessionUser(),
    client = useQueryClient(),
    toast = useToast();
  const members = useQuery({
    queryKey: ['room-members', roomId],
    queryFn: () => chatManagementApi.members(roomId),
    refetchInterval: 10000,
  });
  const [inviting, setInviting] = useState(false),
    [selection, setSelection] = useState<string[]>([]),
    [search, setSearch] = useState(''),
    [removing, setRemoving] = useState<ChatPerson | null>(null);
  const directory = useQuery({
    queryKey: ['chat-directory'],
    queryFn: chatManagementApi.directory,
    enabled: inviting && !!members.data?.can_invite,
  });
  async function updated() {
    await client.invalidateQueries({ queryKey: ['room-members', roomId] });
  }
  const invite = useMutation({
    mutationFn: () => chatManagementApi.invite(roomId, selection),
    onSuccess: async () => {
      await updated();
      setInviting(false);
      setSelection([]);
      toast(isDemo ? '데모 참여자를 추가했습니다.' : '채팅방에 구성원을 초대했습니다.');
    },
  });
  const remove = useMutation({
    mutationFn: () => chatManagementApi.remove(roomId, removing!.id),
    onSuccess: async () => {
      await updated();
      setRemoving(null);
      toast('참여자를 내보냈습니다.');
    },
  });
  const candidates =
    directory.data?.filter(
      (p) =>
        !members.data?.members.some((m) => m.id === p.id) &&
        p.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
    ) ?? [];
  if (members.isPending) return <Loading />;
  if (members.error) return <ErrorState error={members.error} retry={() => members.refetch()} />;
  return (
    <section className="chat-members" data-pending={invite.isPending || remove.isPending}>
      <header>
        <h3>
          <Users size={18} />
          참여자 <span>{members.data.members.length}</span>
        </h3>
        {members.data.can_invite && (
          <button
            className="btn small"
            onClick={() => {
              setInviting(!inviting);
              setRemoving(null);
            }}
          >
            <UserPlus size={15} />
            {inviting ? '초대 닫기' : '초대'}
          </button>
        )}
      </header>
      {isDemo && (
        <p className="muted text-small">
          현재 브라우저의 데모 참여자입니다. 실제 초대·기기 간 공유는 서버 연결 후 사용할 수
          있습니다.
        </p>
      )}
      <div className="chat-member-list">
        {members.data.members.map((p) => (
          <div key={p.id}>
            <span className="chat-person-avatar">{p.name.slice(0, 1)}</span>
            <div>
              <strong>
                {p.name}
                {p.id === user.id ? ' · 나' : ''}
              </strong>
              <small>
                {p.role === 'OWNER' ? '방장' : p.role === 'ADMIN' ? '관리자' : '참여자'}
              </small>
            </div>
            {members.data.can_remove && p.id !== user.id && p.role !== 'OWNER' && (
              <button
                className="icon-btn"
                aria-label={`${p.name} 내보내기`}
                disabled={remove.isPending}
                onClick={() => {
                  setRemoving(p);
                  setInviting(false);
                }}
              >
                <UserRoundMinus size={17} />
              </button>
            )}
          </div>
        ))}
      </div>
      {removing && (
        <div className="chat-member-confirm">
          <p>
            <strong>{removing.name}</strong>님을 이 채팅방에서 내보낼까요?
          </p>
          <small>사업장 계정과 기존 대화는 삭제하지 않습니다.</small>
          <div>
            <button className="btn" disabled={remove.isPending} onClick={() => setRemoving(null)}>
              취소
            </button>
            <button
              className="btn danger"
              disabled={remove.isPending || !navigator.onLine}
              onClick={() => remove.mutate()}
            >
              내보내기
            </button>
          </div>
        </div>
      )}
      {inviting && (
        <div className="chat-invite">
          <label className="field">
            사업장 구성원 검색
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름으로 검색"
            />
          </label>
          {directory.isPending ? (
            <Loading />
          ) : directory.error ? (
            <ErrorState error={directory.error} retry={() => directory.refetch()} />
          ) : !candidates.length ? (
            <Empty title="초대할 구성원이 없습니다" />
          ) : (
            <div className="chat-invite-list">
              {candidates.map((p) => (
                <label key={p.id}>
                  <input
                    type="checkbox"
                    checked={selection.includes(p.id)}
                    onChange={() =>
                      setSelection((old) =>
                        old.includes(p.id) ? old.filter((id) => id !== p.id) : [...old, p.id],
                      )
                    }
                  />
                  {p.name}
                </label>
              ))}
            </div>
          )}
          <button
            className="btn primary full"
            disabled={!selection.length || invite.isPending || !navigator.onLine}
            onClick={() => invite.mutate()}
          >
            {invite.isPending ? '초대 중…' : `${selection.length}명 초대`}
          </button>
        </div>
      )}
      {(invite.error || remove.error) && <ErrorState error={invite.error || remove.error} />}
    </section>
  );
}
